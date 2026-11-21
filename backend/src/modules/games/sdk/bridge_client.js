// TRGame SDK — uygulama köprüsü parçası.
//
// Oyun sayfası WebView'de çalışır ve uygulamayla konuşabilmesi gerekir ("kapat" düğmesi gibi).
// Uygulama tarafındaki yetki kararı `hybrid/js_bridge/bridge_policy.dart` içinde, tek yerde;
// burası yalnızca mesajı doğru biçimde gönderir.
//
// **Oyun sayfası uygulamadan oturum bileti isteyemez.** Dış sayfalara `close` dışında hiçbir
// komut açık değil ve kendi sunucumuzdaki oyunlar da bilete ihtiyaç duymaz: etkinliğe özel
// oyun bileti zaten adres satırıyla geliyor.
export const BRIDGE_JS = `
function _bridge(type,data){
  var msg=JSON.stringify(Object.assign({type:type},data||{}));
  try{
    if(window.TRLive&&window.TRLive.postMessage){window.TRLive.postMessage(msg);return true;}
    if(window.TrLiveBridge&&window.TrLiveBridge.postMessage){window.TrLiveBridge.postMessage(msg);return true;}
  }catch(e){}
  return false;
}
`;
