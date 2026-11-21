import { SESSION_JS } from './session_client.js';
import { EVENTS_JS } from './event_client.js';
import { BRIDGE_JS } from './bridge_client.js';

/// TRGame SDK — oyun sayfalarına eklenen istemci kitaplığı.
///
/// Parçalara ayrıldı (oturum, olaylar, köprü) çünkü hepsi tek dizede yazılıyken hiçbirinin
/// gerekçesi okunamıyordu ve yeniden bağlanma gibi ince davranışlar sessizce yanlış yazılıyordu.
///
/// ## Değişmeyen sınır: para üretimi burada yok
///
/// `bet`, `settle` ve `play` v2.129'da kaldırıldı ve geri gelmeyecek. Oyun sayfası — yani
/// kullanıcının telefonunda çalışan kod — hiçbir koşulda kazancı kendisi belirleyemez.
/// Sonucu sunucu üretir (oyun paketinin sunucu tarafı ya da imzalı sağlayıcı API'si).
/// Çağrılar kaldırılmadı, **açıklayıcı hata fırlatıyor**: sessizce yok olsalardı eski oyunlar
/// hatasız ama ödülsüz çalışır, sebebi günlerce aranırdı.
///
/// Ayrıntı: docs/ARCHITECTURE_AUDIT.md F-01.
export const SDK_JS = `(function(){
${SESSION_JS}
${BRIDGE_JS}
${EVENTS_JS}

function gone(n){return function(){return Promise.reject(new Error(
  'TRGame.'+n+' kaldirildi: Coin bahsi artik oyun sayfasindan yapilamaz. Sonucu sunucu uretmelidir '+
  '(oyun paketi ya da imzali saglayici API). Ayrinti: docs/ARCHITECTURE_AUDIT.md F-01.'));};}

var TR={
  // --- Kimlik ve bağlam ---
  activityId:id,
  token:token,
  uid:q.get('uid')||'',
  name:q.get('name')||'',
  lang:q.get('lang')||'tr',
  roomId:q.get('roomId')||'',

  /** Sunucudan doğrulanmış kullanıcı bilgisi ve bakiye. Adres satırındaki ad/uid gösterim içindir;
      bir karara dayanak yapılacaksa bu çağrı kullanılmalıdır. */
  me:function(){return call('/me');},

  // --- Olaylar ---
  /** Olay dinler. 'open', 'close' ve '*' (hepsi) özel adlardır. */
  on:function(type,fn){(_handlers[type]=_handlers[type]||[]).push(fn);return TR;},
  off:function(type,fn){
    var hs=_handlers[type]||[];
    for(var i=hs.length-1;i>=0;i--)if(hs[i]===fn)hs.splice(i,1);
    return TR;
  },
  /** Bağlantıyı kurar. Kopunca artan beklemeyle kendiliğinden yeniden bağlanır. */
  connect:function(){_closed=false;_connect();return TR;},
  /** Bağlantıyı kapatır ve yeniden bağlanmayı durdurur (oyun bitti). */
  disconnect:function(){
    _closed=true;
    if(_timer){clearTimeout(_timer);_timer=null;}
    if(_ws){try{_ws.close();}catch(e){}_ws=null;}
    return TR;
  },
  /** Sunucuya mesaj gönderir. Bağlantı yoksa false döner — oyun bunu görüp kullanıcıya
      "bağlanılıyor" diyebilsin diye sessizce yutulmaz. */
  send:function(type,data){
    if(!_ws||_ws.readyState!==1)return false;
    try{_ws.send(JSON.stringify({type:type,data:data||null}));return true;}catch(e){return false;}
  },
  /** Bağlantı durumu: 'open' | 'connecting' | 'closed' */
  status:function(){
    if(_closed)return 'closed';
    if(_ws&&_ws.readyState===1)return 'open';
    return 'connecting';
  },

  // --- Uygulama köprüsü ---
  /** Oyunu kapatır (uygulamadaki pencere kapanır). */
  close:function(){return _bridge('close');},

  // --- Kaldırılanlar (bkz. F-01) ---
  bet:gone('bet'),settle:gone('settle'),play:gone('play')
};
window.TRGame=TR;
})();`;
