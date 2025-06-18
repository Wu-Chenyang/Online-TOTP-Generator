let updateInterval;
let currentLanguage = 'en';

// 语言配置
const translations = {
    en: {
        pageTitle: '🔐 TOTP Generator',
        supportedTypes: 'Supported TOTP Types:',
        standardType: 'Standard TOTP',
        standardDesc: '6-digit codes following RFC 6238',
        steamType: 'Steam Guard',
        steamDesc: '5-character codes for Steam platform',
        customType: 'Custom',
        customDesc: 'Adjustable digits and time intervals',
        secretLabel: 'Secret Key (Base32 encoded):',
        secretPlaceholder: 'e.g., JBSWY3DPEHPK3PXP',
        typeLabel: 'TOTP Type:',
        standardOption: 'Standard TOTP (6 digits)',
        steamOption: 'Steam Guard (5 characters)',
        customOption: 'Custom',
        digitsLabel: 'Digits:',
        periodLabel: 'Time Period (seconds):',
        generateBtn: 'Generate TOTP',
        secondsText: 'seconds until refresh',
        errorSecretRequired: 'Please enter a Secret Key',
        errorGenerateFailed: 'Failed to generate TOTP: '
    },
    zh: {
        pageTitle: '🔐 TOTP 生成器',
        supportedTypes: '支持的TOTP类型：',
        standardType: '标准TOTP',
        standardDesc: '符合RFC 6238标准的6位数字码',
        steamType: 'Steam Guard',
        steamDesc: 'Steam平台专用的5位字符码',
        customType: '自定义',
        customDesc: '可调整位数和时间间隔',
        secretLabel: 'Secret Key (Base32编码):',
        secretPlaceholder: '例如: JBSWY3DPEHPK3PXP',
        typeLabel: 'TOTP类型:',
        standardOption: '标准TOTP (6位数字)',
        steamOption: 'Steam Guard (5位字符)',
        customOption: '自定义',
        digitsLabel: '位数:',
        periodLabel: '时间间隔 (秒):',
        generateBtn: '生成 TOTP',
        secondsText: '秒后刷新',
        errorSecretRequired: '请输入Secret Key',
        errorGenerateFailed: '生成TOTP失败: '
    }
};

// 切换语言（优化版）
function switchLanguage(lang) {
    currentLanguage = lang;
    
    // 更新语言按钮状态
    document.querySelectorAll('.lang-btn').forEach(btn => {
        btn.classList.remove('active');
    });
    
    // 找到对应的按钮并激活
    const targetBtn = document.querySelector(`[onclick="switchLanguage('${lang}')"]`);
    if (targetBtn) {
        targetBtn.classList.add('active');
    }
    
    // 更新页面内容
    const t = translations[lang];
    
    document.getElementById('pageTitle').textContent = t.pageTitle;
    document.getElementById('supportedTypes').textContent = t.supportedTypes;
    document.getElementById('standardType').textContent = t.standardType;
    document.getElementById('standardDesc').textContent = t.standardDesc;
    document.getElementById('steamType').textContent = t.steamType;
    document.getElementById('steamDesc').textContent = t.steamDesc;
    document.getElementById('customType').textContent = t.customType;
    document.getElementById('customDesc').textContent = t.customDesc;
    document.getElementById('secretLabel').textContent = t.secretLabel;
    document.getElementById('secretKey').placeholder = t.secretPlaceholder;
    document.getElementById('typeLabel').textContent = t.typeLabel;
    document.getElementById('standardOption').textContent = t.standardOption;
    document.getElementById('steamOption').textContent = t.steamOption;
    document.getElementById('customOption').textContent = t.customOption;
    document.getElementById('digitsLabel').textContent = t.digitsLabel;
    document.getElementById('periodLabel').textContent = t.periodLabel;
    document.getElementById('generateBtn').textContent = t.generateBtn;
    document.getElementById('secondsText').textContent = t.secondsText;
    
    // 更新HTML语言属性
    document.documentElement.lang = lang === 'zh' ? 'zh-CN' : 'en';
}

// Base32 解码函数
function base32Decode(encoded) {
    const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
    let bits = 0;
    let value = 0;
    let output = [];
    
    for (let i = 0; i < encoded.length; i++) {
        const char = encoded.charAt(i).toUpperCase();
        if (char === '=') break;
        
        const index = alphabet.indexOf(char);
        if (index === -1) {
            throw new Error('Invalid Base32 character: ' + char);
        }
        
        value = (value << 5) | index;
        bits += 5;
        
        if (bits >= 8) {
            output.push((value >>> (bits - 8)) & 255);
            bits -= 8;
        }
    }
    
    return new Uint8Array(output);
}

// HMAC-SHA1 实现
async function hmacSha1(key, data) {
    const cryptoKey = await crypto.subtle.importKey(
        'raw',
        key,
        { name: 'HMAC', hash: 'SHA-1' },
        false,
        ['sign']
    );
    
    const signature = await crypto.subtle.sign('HMAC', cryptoKey, data);
    return new Uint8Array(signature);
}

// 生成TOTP
async function generateTOTP() {
    const secretKey = document.getElementById('secretKey').value.trim();
    const totpType = document.getElementById('totpType').value;
    
    if (!secretKey) {
        showError(translations[currentLanguage].errorSecretRequired);
        return;
    }
    
    try {
        let digits = 6;
        let period = 30;
        
        if (totpType === 'steam') {
            digits = 5;
        } else if (totpType === 'custom') {
            digits = parseInt(document.getElementById('digits').value);
            period = parseInt(document.getElementById('period').value);
        }
        
        // 解码密钥
        const key = base32Decode(secretKey.replace(/\s/g, ''));
        
        // 开始更新TOTP
        await updateTOTP(key, digits, period, totpType);
        
        // 清除之前的定时器
        if (updateInterval) {
            clearInterval(updateInterval);
        }
        
        // 设置定时器自动更新
        updateInterval = setInterval(async () => {
            await updateTOTP(key, digits, period, totpType);
        }, 1000);
        
        document.getElementById('result').style.display = 'block';
        document.getElementById('error').style.display = 'none';
        
    } catch (error) {
        showError(translations[currentLanguage].errorGenerateFailed + error.message);
    }
}

// 更新TOTP显示
async function updateTOTP(key, digits, period, type) {
    const now = Math.floor(Date.now() / 1000);
    const timeStep = Math.floor(now / period);
    const timeLeft = period - (now % period);
    
    // 时间步长转换为8字节数组
    const timeBuffer = new ArrayBuffer(8);
    const timeView = new DataView(timeBuffer);
    timeView.setUint32(4, timeStep, false); // 大端序
    
    // 生成HMAC
    const hmac = await hmacSha1(key, new Uint8Array(timeBuffer));
    
    // 动态截取
    const offset = hmac[hmac.length - 1] & 0xf;
    const code = ((hmac[offset] & 0x7f) << 24) |
                ((hmac[offset + 1] & 0xff) << 16) |
                ((hmac[offset + 2] & 0xff) << 8) |
                (hmac[offset + 3] & 0xff);
    
    let totpCode;
    if (type === 'steam') {
        // Steam使用自定义字符集
        const steamChars = '23456789BCDFGHJKMNPQRTVWXY';
        totpCode = '';
        let fullCode = code;
        
        for (let i = 0; i < 5; i++) {
            totpCode += steamChars[fullCode % steamChars.length];
            fullCode = Math.floor(fullCode / steamChars.length);
        }
    } else {
        // 标准TOTP数字码
        totpCode = (code % Math.pow(10, digits)).toString().padStart(digits, '0');
    }
    
    // 更新显示
    document.getElementById('totpCode').textContent = totpCode;
    document.getElementById('timeLeft').textContent = timeLeft;
    
    // 更新进度条
    const progress = ((period - timeLeft) / period) * 100;
    document.getElementById('progressFill').style.width = progress + '%';
    
    // 接近过期时改变颜色
    const progressFill = document.getElementById('progressFill');
    if (timeLeft <= 5) {
        progressFill.style.backgroundColor = '#f44336';
    } else if (timeLeft <= 10) {
        progressFill.style.backgroundColor = '#ff9800';
    } else {
        progressFill.style.backgroundColor = '#4CAF50';
    }
}

// 显示错误信息
function showError(message) {
    const errorDiv = document.getElementById('error');
    errorDiv.innerHTML = '<div class="error">' + message + '</div>';
    errorDiv.style.display = 'block';
    document.getElementById('result').style.display = 'none';
}

// 处理TOTP类型变化
document.getElementById('totpType').addEventListener('change', function() {
    const customOptions = document.getElementById('customOptions');
    if (this.value === 'custom') {
        customOptions.style.display = 'block';
    } else {
        customOptions.style.display = 'none';
    }
});

// 清理定时器
window.addEventListener('beforeunload', function() {
    if (updateInterval) {
        clearInterval(updateInterval);
    }
});

// 初始化页面语言
document.addEventListener('DOMContentLoaded', function() {
    // 检测浏览器语言
    const browserLang = navigator.language || navigator.userLanguage;
    
    // 根据浏览器语言设置默认语言，但始终调用switchLanguage确保状态一致
    if (browserLang.startsWith('zh')) {
        switchLanguage('zh');
    } else {
        // 即使是英文，也要调用switchLanguage('en')来确保按钮状态正确
        switchLanguage('en');
    }
});
