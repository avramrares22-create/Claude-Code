/* Conector OPȚIONAL pentru un model local, rulat în browser (WebLLM / WebGPU).
   Modelul are un singur rol: să transforme cererea în plan JSON. Exercițiile sunt construite și verificate de cod.
   Dacă ai/config.json are enabled:false, nimic din acest fișier nu descarcă nimic. */
(function (M) {
  'use strict';
  const A = (M.aiLocal = { cfg: null, status: 'neconectat', engine: null, error: null, ready: false });

  A.init = function () {
    if (A._p) return A._p;
    if (location.protocol === 'file:') { A._p = Promise.resolve(null); return A._p; }      // deschis direct din fișier: fără încărcări externe
    A._p = fetch('ai/config.json', { cache: 'no-cache' }).then(function (r) { return r.ok ? r.json() : null; }).then(function (c) { A.cfg = c; return c; }).catch(function () { return null; });
    return A._p;
  };
  A.configured = function () { return !!(A.cfg && A.cfg.enabled && A.cfg.modelId); };
  A.supported = function () { return typeof navigator !== 'undefined' && !!navigator.gpu; };

  A.load = function (onProgress) {
    if (!A.configured()) return Promise.reject(new Error('Modelul nu este configurat în ai/config.json.'));
    if (!A.supported()) return Promise.reject(new Error('Acest browser nu are WebGPU. Folosește Chrome sau Edge recent, pe un calculator.'));
    A.status = 'se încarcă'; A.error = null;
    const cfg = A.cfg;
    return import(/* webpackIgnore: true */ cfg.webllmUrl || 'https://esm.run/@mlc-ai/web-llm').then(function (webllm) {
      const appConfig = cfg.modelUrl ? { model_list: [{ model: cfg.modelUrl, model_id: cfg.modelId, model_lib: cfg.modelLibUrl }] } : undefined;
      return webllm.CreateMLCEngine(cfg.modelId, Object.assign({ initProgressCallback: function (p) { if (onProgress) onProgress(p); } }, appConfig ? { appConfig: appConfig } : {}));
    }).then(function (engine) { A.engine = engine; A.status = 'gata'; A.ready = true; return true; }).catch(function (e) { A.status = 'eroare'; A.error = String(e && e.message || e); A.ready = false; throw e; });
  };

  /* cerere → plan JSON (sau null) */
  A.plan = function (text) {
    if (!A.ready) return Promise.resolve(null);
    const messages = [{ role: 'system', content: M.studio.systemPrompt() }, { role: 'user', content: text }];
    const call = A.engine.chat.completions.create({ messages: messages, temperature: 0, max_tokens: 400, response_format: { type: 'json_object', schema: JSON.stringify(M.studio.planSchema()) } });
    const timeout = new Promise(function (_, rej) { setTimeout(function () { rej(new Error('Modelul a răspuns prea lent.')); }, 30000); });
    return Promise.race([call, timeout]).then(function (r) { return JSON.parse(r.choices[0].message.content); }).catch(function () { return null; });
  };
})(window.M);
