"""iPhone (iOS) proje ayarları. GitHub Actions'ta `flutter create --platforms=ios` sonrası mobile/ klasöründe çalışır:
    python3 native/ios/setup_ios.py

Yaptıkları (hepsi tekrar çalıştırılabilir, ikinci kez bir şeyi bozmaz):
  * Info.plist: uygulama adı, kamera / mikrofon / galeri / müzik izin metinleri, arka planda oda sesi, giriş dönüş
    bağlantısı (trlive://login), yalnızca dikey ekran, şifreleme beyanı.
  * En düşük iOS sürümü 14.0 (Podfile + Xcode projesi), paket kimliği com.trlive.trlive.
  * AppDelegate: uygulama açıkken gelen bildirimler de görünsün (flutter_local_notifications).
  * Uygulama simgesi (native/ios/AppIcon.appiconset).
Mantık bu dosyada tutulur: iş akışı (.github) değişmeden buradan güncellenebilir.
"""
import pathlib
import plistlib
import re
import shutil
import sys

ROOT = pathlib.Path(".")
IOS = ROOT / "ios"
HERE = pathlib.Path(__file__).resolve().parent
MIN_IOS = "14.0"
BUNDLE_ID = "com.trlive.trlive"


def info_plist():
    path = IOS / "Runner" / "Info.plist"
    with path.open("rb") as f:
        p = plistlib.load(f)
    # Yeni şablonun sahne (UIScene) ayarı kaldırılır: klasik AppDelegate penceresi kullanılır (bkz. app_delegate).
    p.pop("UIApplicationSceneManifest", None)
    p["CFBundleDisplayName"] = "TR Live"
    p["CFBundleName"] = "TR Live"
    p["NSCameraUsageDescription"] = "Görüntülü odada yayın yapmak ve fotoğraf çekmek için kamera kullanılır."
    p["NSMicrophoneUsageDescription"] = "Sesli ve görüntülü odalarda konuşmak için mikrofon kullanılır."
    p["NSPhotoLibraryUsageDescription"] = "Profil fotoğrafı, oda kapağı ve paylaşım için galeriden fotoğraf seçilir."
    p["NSPhotoLibraryAddUsageDescription"] = "Fotoğrafları galerine kaydedebilmen için."
    p["NSAppleMusicUsageDescription"] = "Odada çalmak için telefonundaki şarkıları seçebilmen için."
    # Oda sesi uygulama arka plandayken de sürer (Android'deki ön plan servisinin karşılığı). "fetch" ve görev kimliği,
    # ön plan servisi eklentisinin iPhone tarafı açılışta kayıt yaptığında çökmemesi için.
    modes = list(p.get("UIBackgroundModes", []))
    for m in ("audio", "fetch"):
        if m not in modes:
            modes.append(m)
    p["UIBackgroundModes"] = modes
    ids = list(p.get("BGTaskSchedulerPermittedIdentifiers", []))
    if "com.pravera.flutter_foreground_task.refresh" not in ids:
        ids.append("com.pravera.flutter_foreground_task.refresh")
    p["BGTaskSchedulerPermittedIdentifiers"] = ids
    # Google / Facebook girişinden dönüş: trlive://login/auth?... (Flutter yakalar: services/login_link.dart)
    types = [t for t in p.get("CFBundleURLTypes", []) if "trlive" not in t.get("CFBundleURLSchemes", [])]
    types.append({"CFBundleURLName": "com.trlive.login", "CFBundleURLSchemes": ["trlive"]})
    p["CFBundleURLTypes"] = types
    p["FlutterDeepLinkingEnabled"] = True
    # Uygulama yalnızca dikey (Android'deki gibi); iPad'de tam ekran.
    p["UISupportedInterfaceOrientations"] = ["UIInterfaceOrientationPortrait"]
    p["UISupportedInterfaceOrientations~ipad"] = ["UIInterfaceOrientationPortrait"]
    p["UIRequiresFullScreen"] = True
    # Yalnızca standart HTTPS şifrelemesi: TestFlight / App Store'da ihracat beyanı sorulmaz.
    p["ITSAppUsesNonExemptEncryption"] = False
    with path.open("wb") as f:
        plistlib.dump(p, f)
    print("Info.plist ayarlandı")


def podfile():
    path = IOS / "Podfile"
    if not path.exists():
        print("Podfile yok (Swift Package Manager): atlandı")
        return
    s = path.read_text()
    s, n = re.subn(r"^#?\s*platform :ios, '[\d.]+'", f"platform :ios, '{MIN_IOS}'", s, count=1, flags=re.M)
    if n == 0:
        s = f"platform :ios, '{MIN_IOS}'\n" + s
    # Eklentilerin (pod) en düşük sürümü de aynı olsun: eski hedefli pod'lar yeni Xcode'da derleme hatası vermesin.
    hook = (
        "    target.build_configurations.each do |config|\n"
        f"      config.build_settings['IPHONEOS_DEPLOYMENT_TARGET'] = '{MIN_IOS}'\n"
        "    end\n"
    )
    if "IPHONEOS_DEPLOYMENT_TARGET" not in s:
        s, n = re.subn(r"(flutter_additional_ios_build_settings\(target\)\n)", r"\1" + hook, s, count=1)
        if n == 0:
            print("UYARI: Podfile post_install bulunamadı; pod hedef sürümü ayarlanmadı")
    path.write_text(s)
    print(f"Podfile: iOS {MIN_IOS}")


def xcode_project():
    path = IOS / "Runner.xcodeproj" / "project.pbxproj"
    s = path.read_text()
    s = re.sub(r"IPHONEOS_DEPLOYMENT_TARGET = [\d.]+;", f"IPHONEOS_DEPLOYMENT_TARGET = {MIN_IOS};", s)
    # Uygulamanın paket kimliği (testlerinki .RunnerTests ekiyle kalır).
    s = re.sub(r"PRODUCT_BUNDLE_IDENTIFIER = [A-Za-z0-9.\-]+?(\.RunnerTests)?;",
               lambda m: f"PRODUCT_BUNDLE_IDENTIFIER = {BUNDLE_ID}{m.group(1) or ''};", s)
    path.write_text(s)
    print(f"Xcode projesi: iOS {MIN_IOS}, paket kimliği {BUNDLE_ID}")


APP_DELEGATE = """import Flutter
import UIKit
import UserNotifications

// TR Live (mobile/native/ios/setup_ios.py yazar): klasik açılış. Eklentiler açılış BİTMEDEN kaydedilir; ön plan servisi
// eklentisi arka plan görevini açılışta kaydettiği için yeni (UIScene / sonradan motor) şablonda açılışta çökebilirdi.
@main
@objc class AppDelegate: FlutterAppDelegate {
  override func application(
    _ application: UIApplication,
    didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]?
  ) -> Bool {
    // Uygulama açıkken gelen bildirimler de görünsün, dokununca uygulama yakalasın (flutter_local_notifications).
    UNUserNotificationCenter.current().delegate = self as? UNUserNotificationCenterDelegate
    GeneratedPluginRegistrant.register(with: self)
    return super.application(application, didFinishLaunchingWithOptions: launchOptions)
  }
}
"""


def app_delegate():
    path = IOS / "Runner" / "AppDelegate.swift"
    path.write_text(APP_DELEGATE)
    print("AppDelegate: klasik açılış + bildirim temsilcisi")


def app_icon():
    src = HERE / "AppIcon.appiconset"
    dst = IOS / "Runner" / "Assets.xcassets" / "AppIcon.appiconset"
    if not src.exists():
        return
    if dst.exists():
        shutil.rmtree(dst)
    shutil.copytree(src, dst)
    print("Uygulama simgesi kopyalandı")


def main():
    if not (IOS / "Runner" / "Info.plist").exists():
        sys.exit("HATA: ios/Runner/Info.plist yok; önce 'flutter create . --platforms=ios' çalışmalı")
    info_plist()
    podfile()
    xcode_project()
    app_delegate()
    app_icon()
    # Sonraki bir hata kolay incelensin diye son hâller kayda yazılır.
    for f in ("Runner/Info.plist", "Runner/AppDelegate.swift", "Podfile"):
        path = IOS / f
        if path.exists():
            print(f"----- ios/{f} -----")
            print(path.read_text())


if __name__ == "__main__":
    main()
