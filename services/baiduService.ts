
/**
 * UTF-8 Encoder for MD5 input
 * Converts JS string (UTF-16) to a "binary string" where each char represents a UTF-8 byte.
 * Essential for correct MD5 hashing of non-ASCII characters (e.g. Chinese).
 */
function utf8Encode(string: string) {
    string = string.replace(/\r\n/g, "\n");
    let utftext = "";
    for (let n = 0; n < string.length; n++) {
        const c = string.charCodeAt(n);
        if (c < 128) {
            utftext += String.fromCharCode(c);
        } else if ((c > 127) && (c < 2048)) {
            utftext += String.fromCharCode((c >> 6) | 192);
            utftext += String.fromCharCode((c & 63) | 128);
        } else {
            utftext += String.fromCharCode((c >> 12) | 224);
            utftext += String.fromCharCode(((c >> 6) & 63) | 128);
            utftext += String.fromCharCode((c & 63) | 128);
        }
    }
    return utftext;
}

/**
 * Simple MD5 implementation for Baidu Sign generation.
 * Avoids external dependencies.
 */
function md5(string: string) {
    function RotateLeft(lValue: number, iShiftBits: number) {
        return (lValue << iShiftBits) | (lValue >>> (32 - iShiftBits));
    }
    function AddUnsigned(lX: number, lY: number) {
        var lX4, lY4, lX8, lY8, lResult;
        lX8 = (lX & 0x80000000);
        lY8 = (lY & 0x80000000);
        lX4 = (lX & 0x40000000);
        lY4 = (lY & 0x40000000);
        lResult = (lX & 0x3FFFFFFF) + (lY & 0x3FFFFFFF);
        if (lX4 & lY4) {
            return (lResult ^ 0x80000000 ^ lX8 ^ lY8);
        }
        if (lX4 | lY4) {
            if (lResult & 0x40000000) {
                return (lResult ^ 0xC0000000 ^ lX8 ^ lY8);
            } else {
                return (lResult ^ 0x40000000 ^ lX8 ^ lY8);
            }
        } else {
            return (lResult ^ lX8 ^ lY8);
        }
    }
    function F(x: number, y: number, z: number) { return (x & y) | ((~x) & z); }
    function G(x: number, y: number, z: number) { return (x & z) | (y & (~z)); }
    function H(x: number, y: number, z: number) { return (x ^ y ^ z); }
    function I(x: number, y: number, z: number) { return (y ^ (x | (~z))); }
    function FF(a: number, b: number, c: number, d: number, x: number, s: number, ac: number) {
        a = AddUnsigned(a, AddUnsigned(AddUnsigned(F(b, c, d), x), ac));
        return AddUnsigned(RotateLeft(a, s), b);
    }
    function GG(a: number, b: number, c: number, d: number, x: number, s: number, ac: number) {
        a = AddUnsigned(a, AddUnsigned(AddUnsigned(G(b, c, d), x), ac));
        return AddUnsigned(RotateLeft(a, s), b);
    }
    function HH(a: number, b: number, c: number, d: number, x: number, s: number, ac: number) {
        a = AddUnsigned(a, AddUnsigned(AddUnsigned(H(b, c, d), x), ac));
        return AddUnsigned(RotateLeft(a, s), b);
    }
    function II(a: number, b: number, c: number, d: number, x: number, s: number, ac: number) {
        a = AddUnsigned(a, AddUnsigned(AddUnsigned(I(b, c, d), x), ac));
        return AddUnsigned(RotateLeft(a, s), b);
    }
    function ConvertTozA(string: string) {
        var nWordToMatch, nWordToMatch3, nByteToMatch;
        var nBitToMatch;
        var nWordCount;
        var lMessageLength = string.length;
        var lNumberOfWords_temp1 = lMessageLength + 8;
        var lNumberOfWords_temp2 = (lNumberOfWords_temp1 - (lNumberOfWords_temp1 % 64)) / 64;
        var lNumberOfWords = (lNumberOfWords_temp2 + 1) * 16;
        var lWordArray = Array(lNumberOfWords - 1);
        var lBytePosition = 0;
        var lByteCount = 0;
        while (lByteCount < lMessageLength) {
            nWordCount = (lByteCount - (lByteCount % 4)) / 4;
            nByteToMatch = (lByteCount % 4) * 8;
            lWordArray[nWordCount] = (lWordArray[nWordCount] | (string.charCodeAt(lByteCount) << nByteToMatch));
            lByteCount++;
        }
        nWordCount = (lByteCount - (lByteCount % 4)) / 4;
        nByteToMatch = (lByteCount % 4) * 8;
        lWordArray[nWordCount] = lWordArray[nWordCount] | (0x80 << nByteToMatch);
        lWordArray[lNumberOfWords - 2] = lMessageLength << 3;
        lWordArray[lNumberOfWords - 1] = lMessageLength >>> 29;
        return lWordArray;
    }
    function WordToHex(lValue: number) {
        var WordToHexValue = "", WordToHexValue_temp = "", lByte, lCount;
        for (lCount = 0; lCount <= 3; lCount++) {
            lByte = (lValue >>> (lCount * 8)) & 255;
            WordToHexValue_temp = "0" + lByte.toString(16);
            WordToHexValue = WordToHexValue + WordToHexValue_temp.substr(WordToHexValue_temp.length - 2, 2);
        }
        return WordToHexValue;
    }
    var x = Array();
    var k, AA, BB, CC, DD, a, b, c, d;
    var S11 = 7, S12 = 12, S13 = 17, S14 = 22;
    var S21 = 5, S22 = 9, S23 = 14, S24 = 20;
    var S31 = 4, S32 = 11, S33 = 16, S34 = 23;
    var S41 = 6, S42 = 10, S43 = 15, S44 = 21;
    string = string + ""; // Ensure string
    x = ConvertTozA(string);
    a = 0x67452301; b = 0xEFCDAB89; c = 0x98BADCFE; d = 0x10325476;
    for (k = 0; k < x.length; k += 16) {
        AA = a; BB = b; CC = c; DD = d;
        a = FF(a, b, c, d, x[k + 0], S11, 0xD76AA478);
        d = FF(d, a, b, c, x[k + 1], S12, 0xE8C7B756);
        c = FF(c, d, a, b, x[k + 2], S13, 0x242070DB);
        b = FF(b, c, d, a, x[k + 3], S14, 0xC1BDCEEE);
        a = FF(a, b, c, d, x[k + 4], S11, 0xF57C0FAF);
        d = FF(d, a, b, c, x[k + 5], S12, 0x4787C62A);
        c = FF(c, d, a, b, x[k + 6], S13, 0xA8304613);
        b = FF(b, c, d, a, x[k + 7], S14, 0xFD469501);
        a = FF(a, b, c, d, x[k + 8], S11, 0x698098D8);
        d = FF(d, a, b, c, x[k + 9], S12, 0x8B44F7AF);
        c = FF(c, d, a, b, x[k + 10], S13, 0xFFFF5BB1);
    }
    return WordToHex(AA) + WordToHex(BB) + WordToHex(CC) + WordToHex(DD);
}

import { BaiduConfig } from "../types";

const JSONP_TIMEOUT = 10000;

interface BaiduResponse {
  from: string;
  to: string;
  trans_result: { src: string; dst: string }[];
  error_code?: string;
  error_msg?: string;
}

export const translateWithBaidu = async (texts: string[], config: BaiduConfig): Promise<string[]> => {
    if (texts.length === 0) return [];
    
    // Baidu supports splitting multiple queries with \n
    // IMPORTANT: 'query' here is the raw string
    const query = texts.join('\n');
    const salt = (new Date).getTime();
    
    // Concat raw parameters
    const str1 = config.appId + query + salt + config.secretKey;
    
    // IMPORTANT: Baidu requires the MD5 input to be UTF-8 encoded bytes.
    // JS strings are UTF-16, so we must encode str1 to UTF-8 before hashing.
    const sign = md5(utf8Encode(str1));

    const params = new URLSearchParams({
        q: query,
        appid: config.appId,
        salt: salt.toString(),
        from: 'auto',
        to: 'zh',
        sign: sign
    });

    return new Promise((resolve, reject) => {
        const callbackName = 'baidu_translate_callback_' + Math.round(100000 * Math.random());
        const script = document.createElement('script');
        
        // Timeout handler
        const timer = setTimeout(() => {
            cleanup();
            reject(new Error('Baidu API Timeout'));
        }, JSONP_TIMEOUT);

        const cleanup = () => {
             // @ts-ignore
             delete window[callbackName];
             if (script.parentNode) script.parentNode.removeChild(script);
             clearTimeout(timer);
        };

        // @ts-ignore
        window[callbackName] = (data: BaiduResponse) => {
            cleanup();
            if (data.error_code) {
                console.error('Baidu API Error:', data.error_code, data.error_msg);
                reject(new Error(`Baidu API Error: ${data.error_msg} (Code: ${data.error_code})`));
                return;
            }
            
            if (data.trans_result) {
                // Map results back to original array length.
                // Note: Baidu might split/merge lines slightly differently if text is complex,
                // but for prompt tags (short phrases), line-by-line usually holds.
                const results = data.trans_result.map(item => item.dst);
                
                // Fallback: If length mismatches, just return empty to fallback to AI
                if (results.length !== texts.length) {
                    console.warn("Baidu returned different number of lines");
                    resolve(texts); // Return originals as fallback or handle explicitly
                } else {
                    resolve(results);
                }
            } else {
                reject(new Error('Invalid response structure'));
            }
        };

        script.src = `https://api.fanyi.baidu.com/api/trans/vip/translate?${params.toString()}&callback=${callbackName}`;
        document.body.appendChild(script);
    });
};
