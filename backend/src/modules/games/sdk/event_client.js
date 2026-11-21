// TRGame SDK — olay ve yeniden bağlanma parçası.
//
// ## Niçin SDK'da
//
// Her oyun paketi bugün kendi WebSocket bağlantısını kuruyor ve neredeyse hiçbiri yeniden
// bağlanmayı doğru yapmıyor: ya hiç denemiyor (telefon uykudan dönünce oyun donuyor), ya da
// hemen ve sonsuz deniyor (ağ kesintisinde sunucuyu bağlantı isteğiyle dövüyor). İkisi de sahada
// görülen davranışlar.
//
// Bu parça tek doğru davranışı bir kez yazar:
//
// * **Artan bekleme (exponential backoff)** — 1s, 2s, 4s… en fazla 30s. Sunucu düşerse binlerce
//   telefonun aynı anda saldırması yerine aralık açılır.
// * **Rastgele sapma (jitter)** — bekleme süresine %0-30 rastgele eklenir. Eklenmezse bütün
//   telefonlar aynı anda yeniden bağlanır ("gürleyen sürü") ve sunucu kalktığı anda yeniden düşer.
// * **Sayfa arkaya alınınca bağlantı kapatılır**, öne gelince hemen kurulur. Arka planda açık
//   tutulan bağlantı pili yer ve zaten telefon tarafından kesilir.
export const EVENTS_JS = `
var _ws=null,_tries=0,_closed=false,_handlers={},_timer=null;

function _emit(type,data){
  var hs=_handlers[type]||[];
  for(var i=0;i<hs.length;i++){try{hs[i](data);}catch(e){}}
}

function _wsUrl(){
  var proto=location.protocol==='https:'?'wss:':'ws:';
  return proto+'//'+location.host+'/ws/g/'+id+'?token='+encodeURIComponent(token);
}

function _connect(){
  if(_closed||_ws)return;
  var ws;
  try{ws=new WebSocket(_wsUrl());}catch(e){_retry();return;}
  _ws=ws;
  ws.onopen=function(){_tries=0;_emit('open',null);};
  ws.onmessage=function(ev){
    var msg;try{msg=JSON.parse(ev.data);}catch(e){return;}
    if(msg&&msg.type)_emit(msg.type,msg.data);
    _emit('*',msg);
  };
  ws.onclose=function(){_ws=null;_emit('close',null);_retry();};
  ws.onerror=function(){try{ws.close();}catch(e){}};
}

function _retry(){
  if(_closed||_timer)return;
  // Artan bekleme + rastgele sapma. Sapmasız beklemede bütün telefonlar aynı anda döner.
  var base=Math.min(30000,1000*Math.pow(2,Math.min(_tries,5)));
  var wait=base+Math.floor(Math.random()*base*0.3);
  _tries++;
  _timer=setTimeout(function(){_timer=null;_connect();},wait);
}

// Sayfa arkaya alınınca bağlantı bırakılır: arka planda açık bağlantı pil yer ve telefon
// tarafından nasılsa kesilir. Öne gelince beklemeden kurulur.
document.addEventListener('visibilitychange',function(){
  if(document.hidden){
    if(_ws){try{_ws.close();}catch(e){}_ws=null;}
    if(_timer){clearTimeout(_timer);_timer=null;}
  }else if(!_closed){
    _tries=0;_connect();
  }
});
`;
