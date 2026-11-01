package com.trlive.tr_live;

import java.lang.reflect.Constructor;
import java.lang.reflect.InvocationHandler;
import java.lang.reflect.Method;
import java.lang.reflect.Proxy;
import java.nio.ByteBuffer;
import java.util.Map;
import java.util.concurrent.ConcurrentLinkedQueue;

/**
 * TR Live güzellik filtresi (kendi filtremiz, ücretli SDK yok). Kameranın her karesini yayına ve önizlemeye gitmeden önce
 * işler: cilt pürüzsüzleştirme (kenarları koruyan yumuşatma), aydınlatma, beyazlatma, pembelik ve renk filtreleri.
 *
 * flutter_webrtc'nin yerel takip arayüzüne (LocalVideoTrack.ExternalVideoFrameProcessing) yansıtmayla (reflection)
 * bağlanır; bu yüzden derleme hiçbir WebRTC sınıfına bağlı değildir. Bir şey uymazsa kare olduğu gibi geçer (yayın
 * hiçbir zaman bozulmaz) ve attach() hata metni döner.
 *
 * GitHub derlemesi bu dosyayı MainActivity ile aynı pakete kopyalar (paket adı derlemede düzeltilir).
 */
public final class BeautyFilter implements InvocationHandler {
    private static final BeautyFilter INSTANCE = new BeautyFilter();

    private static Object proxy;
    private static Object track;
    private static String trackId;
    private static Method removeMethod;

    /** Ayarlar: değişince tek parça olarak değiştirilir (kamera iş parçacığı yarım ayar görmez). */
    private static final class Params {
        final boolean on;
        final int smoothK; // 0..230 (yumuşatma karışım oranı /256)
        final float smooth;
        final byte[] y = new byte[256];
        final byte[] u = new byte[256];
        final byte[] v = new byte[256];

        Params(float smooth, float bright, float white, float rosy, int tone) {
            this.smooth = smooth;
            smoothK = Math.round(smooth * 230f);
            on = smooth > 0.01f || bright > 0.01f || white > 0.01f || rosy > 0.01f || tone != 0;
            double gamma = 1.0 / (1.0 + 0.55 * bright);
            for (int i = 0; i < 256; i++) {
                double f = i / 255.0;
                f = Math.pow(f, gamma);
                f = f + white * 0.24 * (1.0 - f) * (0.35 + f);
                y[i] = (byte) clamp((int) Math.round(f * 255.0));
            }
            double sat = 1.0 - white * 0.18;
            double du = 0, dv = 0;
            switch (tone) {
                case 1: du = -7; dv = 9; break;             // sıcak
                case 2: du = 9; dv = -6; break;             // soğuk
                case 3: sat *= 1.32; break;                 // canlı
                case 4: du = 4; dv = 11; sat *= 1.05; break; // pembe
                case 5: sat = 0; break;                     // siyah-beyaz
                case 6: sat *= 0.7; du = -4; dv = 5; break;  // nostalji
                default: break;
            }
            dv += rosy * 12;
            du += rosy * 2;
            for (int i = 0; i < 256; i++) {
                u[i] = (byte) clamp((int) Math.round(128 + (i - 128) * sat + du));
                v[i] = (byte) clamp((int) Math.round(128 + (i - 128) * sat + dv));
            }
        }
    }

    private static volatile Params params = new Params(0, 0, 0, 0, 0);
    private static volatile int failures = 0;

    private static int clamp(int x) {
        return x < 0 ? 0 : (x > 255 ? 255 : x);
    }

    private static float num(Map<String, ?> m, String k) {
        Object o = m == null ? null : m.get(k);
        if (!(o instanceof Number)) return 0f;
        float f = ((Number) o).floatValue();
        return f < 0 ? 0 : (f > 1 ? 1 : f);
    }

    /** smooth, bright, white, rosy: 0..1; tone: 0 doğal, 1 sıcak, 2 soğuk, 3 canlı, 4 pembe, 5 siyah-beyaz, 6 nostalji. */
    public static void setParams(Map<String, ?> m) {
        if (m == null) return;
        Object t = m.get("tone");
        int tone = t instanceof Number ? ((Number) t).intValue() : 0;
        if (tone < 0 || tone > 6) tone = 0;
        params = new Params(num(m, "smooth"), num(m, "bright"), num(m, "white"), num(m, "rosy"), tone);
        failures = 0;
    }

    public static String attach(String id) {
        return attach(id, null);
    }

    /**
     * Kamera takibine bağlanır (aynı takipse bir şey yapmaz). "ok" ya da neden bağlanamadığı döner.
     * [pluginInstance]: ana ekranın Flutter motorundaki FlutterWebRTCPlugin (yüzen balonun ikinci motoru da bir eklenti
     * örneği oluşturduğu için sharedSingleton yanlış örneği gösterebilir); yoksa sharedSingleton kullanılır.
     */
    public static synchronized String attach(String id, Object pluginInstance) {
        if (id == null || id.isEmpty()) {
            detach();
            return "no_track";
        }
        if (id.equals(trackId) && track != null) return "ok";
        detach();
        try {
            Class<?> plugin = Class.forName("com.cloudwebrtc.webrtc.FlutterWebRTCPlugin");
            Method get = plugin.getMethod("getLocalTrack", String.class);
            Object t = null;
            if (pluginInstance != null && plugin.isInstance(pluginInstance)) t = get.invoke(pluginInstance, id);
            if (t == null) {
                Object single = plugin.getField("sharedSingleton").get(null);
                if (single != null && single != pluginInstance) t = get.invoke(single, id);
            }
            if (t == null) return "no_track";
            Class<?> lvt = Class.forName("com.cloudwebrtc.webrtc.video.LocalVideoTrack");
            if (!lvt.isInstance(t)) return "not_video";
            Class<?> iface = Class.forName("com.cloudwebrtc.webrtc.video.LocalVideoTrack$ExternalVideoFrameProcessing");
            if (proxy == null) proxy = Proxy.newProxyInstance(iface.getClassLoader(), new Class<?>[] {iface}, INSTANCE);
            lvt.getMethod("addProcessor", iface).invoke(t, proxy);
            removeMethod = lvt.getMethod("removeProcessor", iface);
            track = t;
            trackId = id;
            return "ok";
        } catch (Throwable e) {
            return "error: " + e;
        }
    }

    public static synchronized void detach() {
        try {
            if (track != null && removeMethod != null && proxy != null) removeMethod.invoke(track, proxy);
        } catch (Throwable ignored) {
        }
        track = null;
        trackId = null;
        removeMethod = null;
    }

    @Override
    public Object invoke(Object p, Method m, Object[] args) {
        String n = m.getName();
        if ("onFrame".equals(n) && args != null && args.length == 1) return process(args[0]);
        if ("hashCode".equals(n)) return System.identityHashCode(p);
        if ("equals".equals(n)) return args != null && args.length == 1 && args[0] == p;
        if ("toString".equals(n)) return "TrLiveBeauty";
        return null;
    }

    // ------------------------------------------------------------------ WebRTC sınıflarına yansıtmayla erişim

    private static final class Refl {
        final ClassLoader loader;
        final Method getBuffer, getRotation, getTimestampNs, toI420, width, height, dataY, dataU, dataV, strideY, strideU, strideV, release, wrap;
        final Constructor<?> frameCtor;

        Refl(ClassLoader cl) throws Exception {
            loader = cl;
            Class<?> frame = Class.forName("org.webrtc.VideoFrame", false, cl);
            Class<?> buffer = Class.forName("org.webrtc.VideoFrame$Buffer", false, cl);
            Class<?> i420 = Class.forName("org.webrtc.VideoFrame$I420Buffer", false, cl);
            Class<?> java = Class.forName("org.webrtc.JavaI420Buffer", false, cl);
            getBuffer = frame.getMethod("getBuffer");
            getRotation = frame.getMethod("getRotation");
            getTimestampNs = frame.getMethod("getTimestampNs");
            toI420 = buffer.getMethod("toI420");
            width = buffer.getMethod("getWidth");
            height = buffer.getMethod("getHeight");
            release = buffer.getMethod("release");
            dataY = i420.getMethod("getDataY");
            dataU = i420.getMethod("getDataU");
            dataV = i420.getMethod("getDataV");
            strideY = i420.getMethod("getStrideY");
            strideU = i420.getMethod("getStrideU");
            strideV = i420.getMethod("getStrideV");
            wrap = java.getMethod("wrap", int.class, int.class, ByteBuffer.class, int.class, ByteBuffer.class, int.class, ByteBuffer.class, int.class, Runnable.class);
            frameCtor = frame.getConstructor(buffer, int.class, long.class);
        }
    }

    private static Refl refl;

    /** Çıkış kareleri için yeniden kullanılan bellek (karede bırakılınca havuza döner). */
    private static final class Planes {
        final int w, h, cw, ch;
        final ByteBuffer y, u, v;

        Planes(int w, int h) {
            this.w = w;
            this.h = h;
            cw = (w + 1) / 2;
            ch = (h + 1) / 2;
            y = ByteBuffer.allocateDirect(w * h);
            u = ByteBuffer.allocateDirect(cw * ch);
            v = ByteBuffer.allocateDirect(cw * ch);
        }
    }

    private static final ConcurrentLinkedQueue<Planes> pool = new ConcurrentLinkedQueue<>();

    private static Planes takePlanes(int w, int h) {
        Planes p;
        while ((p = pool.poll()) != null) {
            if (p.w == w && p.h == h) return p;
        }
        return new Planes(w, h);
    }

    // Kamera iş parçacığında yeniden kullanılan çalışma dizileri.
    private byte[] srcY = new byte[0], outY = new byte[0], srcU = new byte[0], srcV = new byte[0];
    private int[] integral = new int[0];

    private Object process(Object frame) {
        Params pr = params;
        if (pr == null || !pr.on || failures > 20) return frame;
        try {
            Refl r = refl;
            ClassLoader cl = frame.getClass().getClassLoader();
            if (r == null || r.loader != cl) {
                r = new Refl(cl);
                refl = r;
            }
            Object buf = r.getBuffer.invoke(frame);
            Object i420 = r.toI420.invoke(buf);
            if (i420 == null) return frame;
            final Planes out;
            final int w, h;
            try {
                w = (Integer) r.width.invoke(i420);
                h = (Integer) r.height.invoke(i420);
                if (w <= 0 || h <= 0) return frame;
                out = takePlanes(w, h);
                synchronized (this) {
                    filter(pr, r, i420, out, w, h);
                }
            } finally {
                r.release.invoke(i420);
            }
            final Planes back = out;
            Runnable onRelease = () -> {
                if (pool.size() < 4) pool.offer(back);
            };
            Object outBuf = r.wrap.invoke(null, w, h, out.y, w, out.u, out.cw, out.v, out.cw, onRelease);
            int rot = (Integer) r.getRotation.invoke(frame);
            long ts = (Long) r.getTimestampNs.invoke(frame);
            failures = 0;
            return r.frameCtor.newInstance(outBuf, rot, ts);
        } catch (Throwable e) {
            failures++;
            return frame;
        }
    }

    private static void readPlane(ByteBuffer src, int stride, int w, int h, byte[] dst) {
        ByteBuffer b = src.duplicate();
        for (int row = 0; row < h; row++) {
            b.position(row * stride);
            b.get(dst, row * w, w);
        }
    }

    private void filter(Params pr, Refl r, Object i420, Planes out, int w, int h) throws Exception {
        int n = w * h;
        int cw = out.cw, ch = out.ch, cn = cw * ch;
        if (srcY.length < n) {
            srcY = new byte[n];
            outY = new byte[n];
        }
        if (srcU.length < cn) {
            srcU = new byte[cn];
            srcV = new byte[cn];
        }
        readPlane((ByteBuffer) r.dataY.invoke(i420), (Integer) r.strideY.invoke(i420), w, h, srcY);
        readPlane((ByteBuffer) r.dataU.invoke(i420), (Integer) r.strideU.invoke(i420), cw, ch, srcU);
        readPlane((ByteBuffer) r.dataV.invoke(i420), (Integer) r.strideV.invoke(i420), cw, ch, srcV);

        byte[] lut = pr.y;
        if (pr.smoothK > 0) {
            smooth(srcY, outY, w, h, pr);
            for (int i = 0; i < n; i++) outY[i] = lut[outY[i] & 0xFF];
        } else {
            for (int i = 0; i < n; i++) outY[i] = lut[srcY[i] & 0xFF];
        }
        byte[] lu = pr.u, lv = pr.v;
        for (int i = 0; i < cn; i++) {
            srcU[i] = lu[srcU[i] & 0xFF];
            srcV[i] = lv[srcV[i] & 0xFF];
        }
        out.y.clear();
        out.y.put(outY, 0, n);
        out.y.position(0);
        out.u.clear();
        out.u.put(srcU, 0, cn);
        out.u.position(0);
        out.v.clear();
        out.v.put(srcV, 0, cn);
        out.v.position(0);
    }

    /**
     * Kenarı koruyan yumuşatma (yüzey bulanıklığı benzeri): her pikselin çevresindeki ortalama (integral görüntüyle,
     * yarıçaptan bağımsız hızda) alınır; ortalamaya yakın (cilt dokusu, sivilce, gözenek) pikseller ona doğru çekilir,
     * belirgin kenarlar (göz, kaş, dudak, saç) olduğu gibi kalır.
     */
    private void smooth(byte[] src, byte[] dst, int w, int h, Params pr) {
        int iw = w + 1;
        int need = iw * (h + 1);
        if (integral.length < need) integral = new int[need];
        int[] I = integral;
        for (int x = 0; x <= w; x++) I[x] = 0;
        for (int y = 1; y <= h; y++) {
            int rowSum = 0;
            int o = y * iw, po = (y - 1) * iw, so = (y - 1) * w;
            I[o] = 0;
            for (int x = 1; x <= w; x++) {
                rowSum += src[so + x - 1] & 0xFF;
                I[o + x] = I[po + x] + rowSum;
            }
        }
        int rad = Math.max(2, Math.round(Math.min(w, h) / 90f * (0.6f + pr.smooth)));
        int k = pr.smoothK;
        final int t1 = 10, t2 = 30;
        // Kenar dışındaki tam kutular için bölme yerine sabit noktalı çarpma (hız).
        final int full = (2 * rad + 1) * (2 * rad + 1);
        final int inv = (65536 + full / 2) / full;
        for (int y = 0; y < h; y++) {
            int y1 = Math.max(0, y - rad), y2 = Math.min(h, y + rad + 1);
            int r1 = y1 * iw, r2 = y2 * iw, dh = y2 - y1;
            int row = y * w;
            for (int x = 0; x < w; x++) {
                int x1 = Math.max(0, x - rad), x2 = Math.min(w, x + rad + 1);
                int sum = I[r2 + x2] - I[r1 + x2] - I[r2 + x1] + I[r1 + x1];
                int area = dh * (x2 - x1);
                int mean = area == full ? (sum * inv) >>> 16 : sum / area;
                int v = src[row + x] & 0xFF;
                int d = mean - v;
                int ad = d < 0 ? -d : d;
                int wgt = ad <= t1 ? k : (ad >= t2 ? 0 : k * (t2 - ad) / (t2 - t1));
                dst[row + x] = (byte) (v + (d * wgt >> 8));
            }
        }
    }
}
