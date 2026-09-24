# Ciao · Sesli Çeviri

Bas-konuş (push-to-talk) sesli çevirmen. Telefon için tasarlandı, gece kullanımına uygun karanlık arayüz.

- **Ses → metin:** `gpt-4o-transcribe`
- **Çeviri:** `gpt-4.1` (konuşma bağlamını dikkate alır)
- **Metin → ses:** `gpt-4o-mini-tts`
- Geçmiş, sesler ve hazır ifadeler cihazda (IndexedDB) saklanır; internet kopsa veya telefon kilitlense de silinmez.
- PWA: Safari → Paylaş → "Ana Ekrana Ekle".

## Kurulum

```bash
npm install
cp .env.example .env.local   # OPENAI_API_KEY ekle
npm run dev
```

Vercel'de `OPENAI_API_KEY` ortam değişkenini ekleyin. Anahtar yoksa uygulama içindeki Ayarlar'dan cihaz bazında girilebilir.
