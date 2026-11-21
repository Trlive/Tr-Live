// TRGame SDK — oturum parçası.
//
// Oyun sayfasının kimliği ve bileti. Bilet ETKİNLİĞE ÖZELDİR ve oturum bileti DEĞİLDİR:
// yalnızca o etkinliğin kendi uçlarında geçer, kullanıcının hesabında başka bir şey yapamaz.
//
// ## Bilet adres satırından alınıp SİLİNİR
//
// Sayfa bilete adres satırından ulaşır (`?token=...`). SDK onu okur okumaz:
//   1. sessionStorage'a yazar (sayfa yenilenirse kaybolmasın),
//   2. `history.replaceState` ile adres satırından siler.
//
// Silmenin sebebi: adres satırı tarayıcı geçmişine, yer imlerine ve "bağlantıyı paylaş"
// menüsüne girer. Sunucu tarafında zaten `Referrer-Policy: no-referrer` var ve hata kayıtlarında
// maskeleniyor; bu, telefonun kendi üzerindeki son boşluğu da kapatır.
export const SESSION_JS = `
var q=new URLSearchParams(location.search);
var m=location.pathname.match(/^\\/(?:games|g)\\/([0-9a-f-]{36}|[a-z0-9-]{2,31})\\//i);
var id=m?m[1]:'';
var token=q.get('token')||'';
try{
  if(token){
    sessionStorage.setItem('trg_'+id,token);
    // Bilet adres satırından silinir (geçmiş, yer imi, paylaşma menüsü).
    q.delete('token');
    var rest=q.toString();
    history.replaceState(null,'',location.pathname+(rest?'?'+rest:'')+location.hash);
  } else {
    token=sessionStorage.getItem('trg_'+id)||'';
  }
}catch(e){}

function call(path,body){
  var b=Object.assign({token:token},body||{});
  return fetch('/api/activity-play/'+id+path,{
    method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(b)
  }).then(function(r){return r.json();})
    .then(function(j){if(j.code!==0){var e=new Error(j.message||'Hata');e.code=j.code;throw e;}return j.data;});
}
`;
