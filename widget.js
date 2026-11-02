/* Otto Market Intel — embeddable live widget (self-contained, no deps).
   Drop into any page:  <script src="https://luanalouisesebastiana-cpu.github.io/otto-market-intel/widget.js"></script>
   <div data-otto-widget></div>
   Shows live macro + top opportunities; links to paid x402 reports. */
(function(){
  var BASE='https://luanalouisesebastiana-cpu.github.io/otto-market-intel';
  function el(t,c,h){var e=document.createElement(t);if(c)e.className=c;if(h!=null)e.innerHTML=h;return e;}
  function money(n){return n==null?'—':'$'+Number(n).toLocaleString();}
  function render(host){
    var box=el('div','otto-w');
    box.style.cssText='font-family:system-ui;background:#0b1020;color:#e2e8f0;border:1px solid #1e293b;border-radius:12px;padding:14px;max-width:420px';
    var title=el('div','otto-w-t','<b style="color:#38bdf8">Otto Market Intel</b> <span style="color:#64748b;font-size:11px">· live</span>');
    box.appendChild(title);
    var body=el('div','otto-w-b','<span style="color:#64748b">loading…</span>');
    box.appendChild(body);
    host.appendChild(box);
    fetch(BASE+'/data/intel.json',{cache:'no-store'}).then(function(r){return r.json();}).then(function(d){
      var m=d.macro||{}, opps=(d.opportunities||[]).slice(0,5);
      var h='<div style="display:flex;gap:14px;margin:8px 0;font-size:13px">';
      h+='<span>BTC <b>'+(m.btusd?'$'+Number(m.btusd).toLocaleString():'—')+'</b></span>';
      h+='<span>ETH <b>'+(m.ethusd?'$'+Number(m.ethusd).toLocaleString():'—')+'</b></span>';
      h+='<span>SOL <b>'+(m.solusd?'$'+Number(m.solusd).toLocaleString():'—')+'</b></span></div>';
      h+='<table style="width:100%;font-size:12px;border-collapse:collapse"><thead><tr><th style="text-align:left;color:#94a3b8">Token</th><th style="text-align:right;color:#94a3b8">Liq</th><th style="text-align:right;color:#94a3b8">Δ24h</th></tr></thead><tbody>';
      opps.forEach(function(o){var c=o.change24h;var col=c==null?'#94a3b8':(c>=0?'#4ade80':'#f87171');
        h+='<tr><td>'+o.symbol+'</td><td style="text-align:right">'+money(o.liqUsd)+'</td><td style="text-align:right;color:'+col+'">'+(c==null?'—':(c>=0?'+':'')+c.toFixed(1)+'%')+'</td></tr>';});
      h+='</tbody></table>';
      h+='<div style="margin-top:10px;font-size:12px"><a href="'+BASE+'/intel.html" style="color:#38bdf8">Full intel (x402)</a> · <a href="'+BASE+'/leaderboard.html" style="color:#38bdf8">Edge proof</a></div>';
      body.innerHTML=h;
    }).catch(function(){body.innerHTML='<span style="color:#f87171">data unavailable</span>';});
  }
  var hosts=document.querySelectorAll('[data-otto-widget]');
  for(var i=0;i<hosts.length;i++) render(hosts[i]);
})();
