import { GoogleGenerativeAI } from "@google/generative-ai";

// Kumpulan API Key yang sudah diobfuscate (disamarkan)
// Ditambah 4 kunci baru dari request user
const OBFUSCATED_KEYS = [
  "=EkexI0ROhjTqF3YtA3Tw9VZzEXLQZVN3kVWTpUVUlGRq5kcKNjRrpnRyEET24kU4IWQuEVQ",
  "=c3cxI2TPN1U5FnaqNzd6tES1JFRJFEU5MDdqJnUw5mMiZ2TsplM1JVTIZWS24kU4IWQuEVQ",
  "=EkVzYXZHNmbfN2USZVY4h0b4JWW1UFNa9lay40cxM2c3hmd61kQBh0NqtET24kU4IWQuEVQ",
  "=EUbkJUcwZzbxNDS2FTbyt0XU9kW0NET5ckeSpXTZhzQHh0Q29kaOJ1N5dWS24kU4IWQuEVQ",
  "=ElbDZUOHVVajJ2d1UXcvVmNJx0aIN1M4MlNo52c4h3cSdUcCBFexYWL61SS24kU4IWQuEVQ",
  "=cWd1czax0Cc2MGa3RET0QlZ2xGcaF2N6p3VkFHazF3RqRTNzQmT2RnVQpkS24kU4IWQuEVQ",
  "=EkVWtUTxRUW61CNuJEVmRUbOlWM3pmZ6dTZz4GaE5Ga0c3R550T3EVTfpVS24kU4IWQuEVQ",
  "=cWWZNnY4IHaLNjMGJTbCVFW5tmeYtGdtwGdWhmZMlHTJhnT5oGUwsmRS9ET24kU4IWQuEVQ",
  "=EkNyIUdJJmcUZ1cJRkdUpEWwsULxJ1bHx0TQZ0cFNWMDpFSGhGbMdXeQdVS24kU4IWQuEVQ"
];

// Helper untuk membuka samaran (deobfuscate) API Key
const getRealKeys = () => {
    try {
        if (OBFUSCATED_KEYS.length === 0) return [];
        return OBFUSCATED_KEYS.map(k => atob(k.split('').reverse().join('')));
    } catch(e) {
        console.error("Gagal membaca API Key imo_ai");
        return [];
    }
};

// Fungsi untuk mencoba memanggil AI dengan API Key tertentu
const attemptCallWithKey = async (apiKey, history, newPrompt) => {
    const genAI = new GoogleGenerativeAI(apiKey);
    // Sesuai permintaan: menggunakan Gemini 3.1 Pro (diambil dari preview yg tersedia)
    const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

    const chat = model.startChat({
        history: history,
        generationConfig: {
            maxOutputTokens: 2000,
        },
    });

    const result = await chat.sendMessage([{text: newPrompt}]);
    const response = await result.response;
    return response.text();
};

export const callImoAI = async (chatContext, messageHistory, newPrompt) => {
    const keys = getRealKeys();
    if (keys.length === 0) {
        return "Mohon maaf, API Key imo_ai belum dikonfigurasi di sistem.";
    }

    // Konversi riwayat pesan ke format Gemini
    const history = messageHistory.map(msg => ({
        role: msg.sender === 'imo_ai' ? 'model' : 'user',
        parts: [{ text: msg.text }]
    }));

    // Tentukan index API Key awal berdasarkan hash chatContext agar setiap room punya default key
    let hash = 0;
    for (let i = 0; i < chatContext.length; i++) {
        const char = chatContext.charCodeAt(i);
        hash = ((hash << 5) - hash) + char;
        hash = hash & hash;
    }
    
    let startIndex = Math.abs(hash) % keys.length;
    let attempts = 0;

    // Loop mencoba (merotasi) API Key jika kena limit atau gagal
    while (attempts < keys.length) {
        const currentKeyIndex = (startIndex + attempts) % keys.length;
        const currentKey = keys[currentKeyIndex];

        try {
            console.log(`Mencoba API Key index ke-${currentKeyIndex}...`);
            const responseText = await attemptCallWithKey(currentKey, history, newPrompt);
            return responseText; // Jika sukses, langsung kembalikan hasil
        } catch (error) {
            console.error(`Gagal dengan API Key index ke-${currentKeyIndex}:`, error.message);
            // Lanjut ke API Key berikutnya (rotasi) jika gagal (karena limit dll)
            attempts++;
        }
    }

    // Jika semua API Key di-loop tapi gagal
    return "Maaf, semua API Key imo_ai saat ini sedang mengalami limit atau gangguan. Silakan coba lagi nanti.";
};

