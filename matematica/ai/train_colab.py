# -*- coding: utf-8 -*-
"""
Antrenează un model MIC care transformă cereri în română în planuri JSON pentru generatorul de exerciții.
Rulează în Google Colab (GPU gratuit T4):  Runtime → Change runtime type → T4 GPU,
apoi încarcă ai/data/train.jsonl, val.jsonl și test.jsonl și rulează celulele de mai jos (sau tot fișierul).

NEVERIFICAT în containerul în care a fost scris proiectul (acolo nu există GPU): scriptul urmează API-ul Unsloth/TRL
cunoscut, dar versiunile bibliotecilor se schimbă. Dacă o celulă dă eroare, mesajul spune de obicei ce argument s-a mutat.

De ce un model mic: el NU face matematică. Matematica o fac cod și verificări exacte. Modelul doar „traduce” cererea în plan,
iar la utilizare formatul JSON este impus de o schemă (nu poate inventa familii de exerciții care nu există).
"""

# ---- 1. instalare (în Colab, într-o celulă separată) ----
# !pip install -q unsloth trl datasets

import json, re, time

BASE = "unsloth/Qwen2.5-0.5B-Instruct"      # rapid și mic (~1 GB în browser, în 4 biți mai puțin). Pentru mai multă siguranță: "unsloth/Qwen2.5-1.5B-Instruct"
MAX_LEN = 512
EPOCHS = 2
LR = 2e-4

from unsloth import FastLanguageModel
from unsloth.chat_templates import train_on_responses_only
from datasets import load_dataset
from trl import SFTTrainer, SFTConfig

model, tok = FastLanguageModel.from_pretrained(BASE, max_seq_length=MAX_LEN, load_in_4bit=True)
model = FastLanguageModel.get_peft_model(
    model, r=16, lora_alpha=32, lora_dropout=0.0, bias="none",
    target_modules=["q_proj", "k_proj", "v_proj", "o_proj", "gate_proj", "up_proj", "down_proj"],
    use_gradient_checkpointing="unsloth", random_state=3407,
)

ds_train = load_dataset("json", data_files="train.jsonl", split="train")
ds_val = load_dataset("json", data_files="val.jsonl", split="train")

def fmt(batch):
    return {"text": [tok.apply_chat_template(m, tokenize=False, add_generation_prompt=False) for m in batch["messages"]]}

ds_train = ds_train.map(fmt, batched=True, remove_columns=ds_train.column_names)
ds_val = ds_val.map(fmt, batched=True, remove_columns=ds_val.column_names)

trainer = SFTTrainer(
    model=model, tokenizer=tok, train_dataset=ds_train, eval_dataset=ds_val,
    args=SFTConfig(
        dataset_text_field="text", max_seq_length=MAX_LEN, per_device_train_batch_size=16, gradient_accumulation_steps=2,
        num_train_epochs=EPOCHS, learning_rate=LR, lr_scheduler_type="cosine", warmup_ratio=0.05, weight_decay=0.01,
        logging_steps=25, eval_strategy="epoch", save_strategy="no", optim="adamw_8bit", seed=3407, report_to="none",
        fp16=not FastLanguageModel.is_bfloat16_supported() if hasattr(FastLanguageModel, "is_bfloat16_supported") else True,
    ),
)
# învață doar din răspunsul asistentului (planul JSON), nu din cerere
trainer = train_on_responses_only(trainer, instruction_part="<|im_start|>user\n", response_part="<|im_start|>assistant\n")

t0 = time.time()
trainer.train()
print("timp antrenare: %.1f minute" % ((time.time() - t0) / 60))

# ---- 2. evaluare pe cereri cu formulări NEVĂZUTE (test.jsonl) ----
FastLanguageModel.for_inference(model)

def norm(plan):
    return dict(
        count=plan.get("count"), level=plan.get("level", 0), ramp=bool(plan.get("ramp")), weak=bool(plan.get("weak")),
        templates=sorted((t["id"], json.dumps(t.get("where"), sort_keys=True)) for t in plan.get("templates", [])),
    )

def predict(system, user):
    msgs = [{"role": "system", "content": system}, {"role": "user", "content": user}]
    ids = tok.apply_chat_template(msgs, add_generation_prompt=True, return_tensors="pt").to("cuda")
    out = model.generate(input_ids=ids, max_new_tokens=300, do_sample=False)
    return tok.decode(out[0][ids.shape[1]:], skip_special_tokens=True)

rows = [json.loads(l) for l in open("test.jsonl", encoding="utf8")]
ok = valid = 0
for r in rows[:200]:
    system, user, gold = r["messages"][0]["content"], r["messages"][1]["content"], json.loads(r["messages"][2]["content"])
    try:
        pred = json.loads(re.search(r"\{.*\}", predict(system, user), re.S).group(0)); valid += 1
        ok += norm(pred) == norm(gold)
    except Exception:
        pass
n = min(200, len(rows))
print("JSON valid: %.1f%%   plan complet corect: %.1f%%   (parserul cu reguli din site: rulează `node ai/eval_baseline.mjs test`)" % (100 * valid / n, 100 * ok / n))

# ---- 3. salvare (adaptor LoRA mic + model îmbinat în 16 biți pentru conversie) ----
model.save_pretrained("mate-plan-lora"); tok.save_pretrained("mate-plan-lora")
model.save_pretrained_merged("mate-plan-merged", tok, save_method="merged_16bit")
print("Gata. Descarcă folderul mate-plan-merged și urmează pașii din ai/README.md (conversia pentru browser).")
