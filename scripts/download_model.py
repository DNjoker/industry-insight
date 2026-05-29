"""Download the embedding model from HuggingFace mirror before packaging.

Usage: python scripts/download_model.py
"""

import os
import sys

# Must set BEFORE any huggingface_hub import
os.environ["HF_ENDPOINT"] = "https://hf-mirror.com"

MODEL_NAME = "paraphrase-multilingual-MiniLM-L12-v2"
TARGET_DIR = os.path.join(os.path.dirname(os.path.dirname(__file__)), "models", MODEL_NAME)

EXPECTED_FILES = [
    "config.json",
    "model.safetensors",
    "tokenizer.json",
    "sentence_bert_config.json",
    "modules.json",
    "1_Pooling/config.json",
]


def model_exists() -> bool:
    for f in EXPECTED_FILES:
        if not os.path.exists(os.path.join(TARGET_DIR, f)):
            return False
    return True


def download():
    if model_exists():
        print(f"Model already downloaded at: {TARGET_DIR}")
        return

    print(f"Downloading {MODEL_NAME} from {os.environ['HF_ENDPOINT']}...")
    print(f"Target: {TARGET_DIR}")

    os.makedirs(os.path.dirname(TARGET_DIR), exist_ok=True)

    from huggingface_hub import snapshot_download

    snapshot_download(
        repo_id=f"sentence-transformers/{MODEL_NAME}",
        local_dir=TARGET_DIR,
        local_dir_use_symlinks=False,
        resume_download=True,
    )

    if model_exists():
        total_size = 0
        for root, dirs, files in os.walk(TARGET_DIR):
            for f in files:
                total_size += os.path.getsize(os.path.join(root, f))
        print(f"Download complete. Total size: {total_size / 1024 / 1024:.0f} MB")
    else:
        print("ERROR: Download verification failed. Missing files:")
        for f in EXPECTED_FILES:
            full = os.path.join(TARGET_DIR, f)
            print(f"  {'[OK]' if os.path.exists(full) else '[MISSING]'} {f}")
        sys.exit(1)


if __name__ == "__main__":
    download()
