// التبديل بين تبويب التشفير وفك التشفير
function switchTab(tab) {
    document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));
    document.querySelectorAll('.card').forEach(card => card.classList.remove('active'));

    if (tab === 'encode') {
        document.querySelectorAll('.tab-btn')[0].classList.add('active');
        document.getElementById('encode-section').classList.add('active');
    } else {
        document.querySelectorAll('.tab-btn')[1].classList.add('active');
        document.getElementById('decode-section').classList.add('active');
    }
}

// عرض معاينة فورية للصورة عند اختيارها في قسم فك التشفير
function previewDecodeImage(event) {
    const file = event.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = function(e) {
        document.getElementById('preview-img').src = e.target.result;
        document.getElementById('result-area').classList.remove('hidden');
        document.getElementById('revealed-text').value = '';
        document.getElementById('decode-status').textContent = '';
    };
    reader.readAsDataURL(file);
}

// اشتقاق مفتاح تشفير AES من كلمة المرور
async function deriveKey(password, salt) {
    const enc = new TextEncoder();
    const keyMaterial = await window.crypto.subtle.importKey(
        "raw", enc.encode(password), { name: "PBKDF2" }, false, ["deriveKey"]
    );
    return window.crypto.subtle.deriveKey(
        { name: "PBKDF2", salt: salt, iterations: 100000, hash: "SHA-256" },
        keyMaterial,
        { name: "AES-GCM", length: 256 },
        false,
        ["encrypt", "decrypt"]
    );
}

// تشفير النص بكلمة المرور
async function encryptText(text, password) {
    const enc = new TextEncoder();
    const salt = window.crypto.getRandomValues(new Uint8Array(16));
    const iv = window.crypto.getRandomValues(new Uint8Array(12));
    const key = await deriveKey(password, salt);
    
    const encrypted = await window.crypto.subtle.encrypt(
        { name: "AES-GCM", iv: iv }, key, enc.encode(text)
    );

    const combined = new Uint8Array(salt.length + iv.length + encrypted.byteLength);
    combined.set(salt, 0);
    combined.set(iv, salt.length);
    combined.set(new Uint8Array(encrypted), salt.length + iv.length);
    return combined;
}

// فك تشفير النص بكلمة المرور
async function decryptText(combinedBytes, password) {
    const salt = combinedBytes.slice(0, 16);
    const iv = combinedBytes.slice(16, 28);
    const data = combinedBytes.slice(28);
    const key = await deriveKey(password, salt);

    const decrypted = await window.crypto.subtle.decrypt(
        { name: "AES-GCM", iv: iv }, key, data
    );
    return new TextDecoder().decode(decrypted);
}

// دالة إخفاء النص داخل بكسلات الصورة وتحميلها
async function encodeMessage() {
    const fileInput = document.getElementById('encode-image');
    const text = document.getElementById('secret-text').value;
    const password = document.getElementById('encode-password').value;
    const status = document.getElementById('encode-status');

    if (!fileInput.files[0] || !text || !password) {
        status.style.color = '#ef4444';
        status.textContent = 'يرجى اختيار صورة وكتابة النص وكلمة المرور!';
        return;
    }

    status.style.color = '#3b82f6';
    status.textContent = 'جاري التشفير ودمج البيانات...';

    try {
        const encryptedBytes = await encryptText(text, password);
        
        // إضافة 4 بايت في البداية لتخزين طول الرسالة المشفرة
        const totalLength = encryptedBytes.length;
        const payload = new Uint8Array(4 + totalLength);
        new DataView(payload.buffer).setUint32(0, totalLength, false);
        payload.set(encryptedBytes, 4);

        const img = new Image();
        img.onload = function() {
            const canvas = document.getElementById('canvas');
            const ctx = canvas.getContext('2d');
            canvas.width = img.width;
            canvas.height = img.height;
            ctx.drawImage(img, 0, 0);

            const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
            const pixels = imgData.data;

            // التحقق من أن حجم الصورة يكفي لاستيعاب النص
            const maxBits = (pixels.length / 4) * 3;
            if (payload.length * 8 > maxBits) {
                status.style.color = '#ef4444';
                status.textContent = 'حجم الصورة صغير جداً مقارنة بطول النص، اختر صورة أكبر!';
                return;
            }

            // إخفاء البتات في قنوات الألوان (R, G, B)
            let bitIndex = 0;
            for (let i = 0; i < payload.length; i++) {
                for (let bit = 7; bit >= 0; bit--) {
                    const pixelChannelIndex = Math.floor(bitIndex / 3) * 4 + (bitIndex % 3);
                    const bitVal = (payload[i] >> bit) & 1;
                    pixels[pixelChannelIndex] = (pixels[pixelChannelIndex] & 0xFE) | bitVal;
                    bitIndex++;
                }
            }

            ctx.putImageData(imgData, 0, 0);

            // تحميل الصورة النهائية بصيغة PNG
            canvas.toBlob(function(blob) {
                const link = document.createElement('a');
                link.download = 'secret_image.png';
                link.href = URL.createObjectURL(blob);
                link.click();
                status.style.color = '#10b981';
                status.textContent = 'تم التشفير بنجاح! تم تحميل الصورة بصيغة PNG.';
            }, 'image/png');
        };
        img.src = URL.createObjectURL(fileInput.files[0]);
    } catch (e) {
        status.style.color = '#ef4444';
        status.textContent = 'حدث خطأ أثناء التشفير!';
    }
}

// دالة استخراج النص وفك تشفيره
async function decodeMessage() {
    const fileInput = document.getElementById('decode-image');
    const password = document.getElementById('decode-password').value;
    const status = document.getElementById('decode-status');
    const revealedBox = document.getElementById('revealed-text');

    if (!fileInput.files[0] || !password) {
        status.style.color = '#ef4444';
        status.textContent = 'يرجى رفع الصورة وإدخال كلمة المرور!';
        return;
    }

    status.style.color = '#3b82f6';
    status.textContent = 'جاري استخراج وفك تشفير النص...';

    const img = new Image();
    img.onload = async function() {
        const canvas = document.getElementById('canvas');
        const ctx = canvas.getContext('2d');
        canvas.width = img.width;
        canvas.height = img.height;
        ctx.drawImage(img, 0, 0);

        const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height).data;

        // دالة مساعدة لقراءة البايتات من البكسلات
        function readBytes(numBytes, startBitOffset) {
            const result = new Uint8Array(numBytes);
            let bitIndex = startBitOffset;
            for (let i = 0; i < numBytes; i++) {
                let byteVal = 0;
                for (let bit = 7; bit >= 0; bit--) {
                    const pixelChannelIndex = Math.floor(bitIndex / 3) * 4 + (bitIndex % 3);
                    const bitVal = pixels[pixelChannelIndex] & 1;
                    byteVal = (byteVal << 1) | bitVal;
                    bitIndex++;
                }
                result[i] = byteVal;
            }
            return result;
        }

        try {
            // قراءة أول 4 بايت لمعرفة طول الرسالة
            const lengthBytes = readBytes(4, 0);
            const messageLength = new DataView(lengthBytes.buffer).getUint32(0, false);

            // التحقق من منطقية الطول المستخرج
            const maxBytes = Math.floor(((pixels.length / 4) * 3) / 8) - 4;
            if (messageLength <= 0 || messageLength > maxBytes) {
                throw new Error("لا توجد بيانات صالحة");
            }

            // قراءة الرسالة المشفرة وفك تشفيرها
            const encryptedBytes = readBytes(messageLength, 32);
            const decryptedText = await decryptText(encryptedBytes, password);

            revealedBox.value = decryptedText;
            document.getElementById('result-area').classList.remove('hidden');
            status.style.color = '#10b981';
            status.textContent = 'تم فك التشفير بنجاح!';
        } catch (e) {
            revealedBox.value = '';
            status.style.color = '#ef4444';
            status.textContent = 'فشل فك التشفير! كلمة المرور خاطئة أو الصورة لا تحتوي على نص مشفر.';
        }
    };
    img.src = URL.createObjectURL(fileInput.files[0]);
}

// نسخ النص المستخرج
function copyText() {
    const textArea = document.getElementById('revealed-text');
    if (!textArea.value) return;
    navigator.clipboard.writeText(textArea.value);
    const btn = document.querySelector('.copy-btn');
    btn.textContent = 'تم النسخ ✓';
    setTimeout(() => btn.textContent = 'نسخ النص', 2000);
}
