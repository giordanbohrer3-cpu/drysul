/* Privacidade: o site não usa cookies de rastreamento nem analytics. O único conteúdo de terceiros é o mapa/Street View
   do Google (pode gravar cookies do Google), que só carrega sozinho com a permissão da pessoa; sem ela, só ao tocar.
   A escolha fica no aparelho com finalidade, versão e data (localStorage "drysul-consentimento") e pode ser mudada
   a qualquer momento pelo rodapé ("Privacidade e cookies"). */
(function () {
  'use strict';
  var KEY = 'drysul-consentimento', VERSAO = '2026-10-21', html = document.documentElement;
  function ler() { try { var c = JSON.parse(localStorage.getItem(KEY)); return c && c.versao === VERSAO ? c : null; } catch (e) { return null; } }
  function gravar(google) {
    var c = { versao: VERSAO, data: new Date().toISOString(), finalidades: { essencial: true, google: !!google } };
    try { localStorage.setItem(KEY, JSON.stringify(c)); } catch (e) {}
    return c;
  }
  var escolha = ler(), caixa = null;
  function fechar() { if (caixa) { caixa.remove(); caixa = null; } html.classList.remove('consent-aberto'); }
  function decidir(google) {
    escolha = gravar(google); fechar();
    document.dispatchEvent(new CustomEvent('drysul:consentimento', { detail: escolha }));
  }
  function abrir(foco) {
    if (caixa) return;
    caixa = document.createElement('section');
    caixa.className = 'consent';
    caixa.setAttribute('aria-label', 'Privacidade e cookies');
    caixa.innerHTML = '<p><b>Privacidade:</b> não usamos cookies de rastreamento. O mapa e o Street View da loja vêm do Google, que pode usar cookies próprios. ' +
      '<a href="privacidade.html">Política de privacidade</a></p><div class="consent__acoes">' +
      '<button class="btn btn--sm btn--primary" type="button" data-c="sim">Permitir mapa do Google</button>' +
      '<button class="btn btn--sm btn--outline" type="button" data-c="nao">Só o essencial</button></div>';
    caixa.addEventListener('click', function (ev) { var b = ev.target.closest('[data-c]'); if (b) decidir(b.getAttribute('data-c') === 'sim'); });
    document.body.appendChild(caixa);
    html.classList.add('consent-aberto');
    if (foco) { var b = caixa.querySelector('button'); if (b) b.focus(); }
  }
  document.addEventListener('click', function (ev) { if (ev.target.closest('[data-open-privacidade]')) { fechar(); abrir(true); } });
  if (!escolha) { if (document.body) abrir(false); else document.addEventListener('DOMContentLoaded', function () { abrir(false); }); }
  window.DrysulConsentimento = { google: function () { return !!(escolha && escolha.finalidades.google); }, abrir: abrir, escolha: function () { return escolha; } };
})();
