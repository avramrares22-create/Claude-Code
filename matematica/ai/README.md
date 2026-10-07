# AI local pentru Studio — ghid simplu

## Ce este, în două fraze

Studio înțelege cereri ca „5 probleme mai grele cu povestea fotbalului”. Pentru asta are **două trepte**:

1. **Generatorul integrat** (reguli în română). Merge mereu, offline, fără nimic de instalat. Pe cereri scrise în formulări
   pe care nu le-a „văzut” a înțeles complet **91,5%** din 400 de cereri-test (`node ai/eval_baseline.mjs test`).
2. **Modelul tău local** (opțional). Un model mic, antrenat de tine în ~1 oră, care rulează în browser și înțelege cereri
   scrise mai liber. **El nu face matematică.**

## De ce modelul nu face matematică (și de ce așa e mai bine)

Un model de limbaj poate greși orice calcul. Aici fiecare exercițiu este **construit și verificat de cod** (formule exacte,
cu o a doua verificare independentă). Modelul face un singur lucru: transformă propoziția ta într-un mic plan JSON, ca
`{"count":5,"level":3,"templates":[{"id":"app-path","where":{"pl":[0]}}]}`. Dacă greșește planul, cel mult primești alt
tip de exercițiu; **nu primești niciodată un răspuns greșit**.

Despre „antrenat de la zero pe toate site-urile”: nu e realist (ar costa milioane și ar ieși mai slab decât un model
deschis deja antrenat). Facem **fine-tuning** pe un model deschis mic, pe datele acestui site: ~6.000 de exemple
de cereri → planuri, construite de `make_dataset.mjs`.

## Ce a fost verificat și ce NU

| | Stare |
|---|---|
| Setul de date (6.000 / 291 / 400 exemple), toate planurile generează exerciții valide | ✅ verificat aici |
| Scorul parserului cu reguli (referința pe care modelul trebuie s-o depășească) | ✅ măsurat aici |
| Antrenarea (`train_colab.py`) | ⚠️ **neverificat** — containerul în care s-a construit site-ul nu are GPU. Scriptul urmează API-ul Unsloth/TRL; versiunile se mută, deci poate cere mici ajustări. |
| Conversia și rularea în browser (WebLLM) | ⚠️ **neverificat** — vezi „Pasul 4”. |

Spre deosebire de ce ai putea crede, un fine-tune de ~1 oră **nu** îl face „god tier” la matematică și nu are rost să o facă:
rolul lui e să înțeleagă cereri. Pentru asta un model de 0,5–1,5 miliarde de parametri e suficient.

## Pașii

### Pasul 1 — datele (deja făcute, le poți reface)
```
node ai/make_dataset.mjs            # → ai/data/train.jsonl, val.jsonl, test.jsonl
node ai/eval_baseline.mjs test      # scorul de depășit
```
Poți face mai multe exemple: `node ai/make_dataset.mjs --train 12000`.

### Pasul 2 — antrenarea (Google Colab, GPU gratuit)
1. Deschide <https://colab.research.google.com>, creează un notebook nou și alege **Runtime → Change runtime type → T4 GPU**.
2. Încarcă în Colab fișierele `train.jsonl`, `val.jsonl`, `test.jsonl` și `train_colab.py`.
3. Rulează `!pip install -q unsloth trl datasets`, apoi `%run train_colab.py`.
4. Durata estimată: ~10–20 de minute pentru modelul de 0,5B și ~30–60 pentru cel de 1,5B pe un T4 (estimare, nemăsurată aici).
5. La final scriptul afișează cât la sută din cererile **nevăzute** transformă într-un plan complet corect. Dacă nu depășește
   scorul parserului cu reguli, **nu merită** să-l conectezi: rămâi pe generatorul integrat.

### Pasul 3 — găzduirea
Încarcă folderul `mate-plan-merged` pe un cont gratuit Hugging Face (<https://huggingface.co/new>).

### Pasul 4 — conversia pentru browser (neverificat)
Site-ul folosește **WebLLM** (rulează modelul în browser, pe WebGPU: Chrome sau Edge recent, pe calculator).
Ai nevoie de formatul MLC al modelului și de un fișier `.wasm`:
```
# instalează MLC-LLM după instrucțiunile de pe https://llm.mlc.ai/docs/install/ (comanda de instalare se schimbă des)
mlc_llm convert_weights mate-plan-merged --quantization q4f16_1 -o mate-plan-q4
mlc_llm gen_config mate-plan-merged --quantization q4f16_1 --conv-template chatml -o mate-plan-q4
mlc_llm compile mate-plan-q4/mlc-chat-config.json --device webgpu -o mate-plan-q4/model.wasm
```
Încarcă `mate-plan-q4/` (greutățile și `model.wasm`) pe Hugging Face. Pașii și numele comenzilor MLC se schimbă între
versiuni; dacă una dă eroare, caută comanda actuală în documentația MLC.

### Pasul 5 — conectarea în site
Completează `ai/config.json`:
```json
{
  "enabled": true,
  "modelId": "mate-plan-q4",
  "modelUrl": "https://huggingface.co/CONTUL-TAU/mate-plan-q4/resolve/main/",
  "modelLibUrl": "https://huggingface.co/CONTUL-TAU/mate-plan-q4/resolve/main/model.wasm",
  "webllmUrl": "https://esm.run/@mlc-ai/web-llm"
}
```
Apoi în **Studio AI** apare butonul **Activează modelul local**. Se descarcă o singură dată (câteva sute de MB).

## Siguranță
- Nicio cheie secretă nu este necesară și nimic nu se trimite către un server: modelul rulează în browser.
- Chiar dacă modelul răspunde prostii, planul trece prin `studio.planFromJSON`: acceptă doar familii existente, filtre
  permise și cel mult 10 exerciții. Orice exercițiu este apoi **recalculat** înainte să fie afișat.
- Cât timp `enabled` este `false`, site-ul nu descarcă niciun model și nu face nicio cerere în plus.
