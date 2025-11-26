
import { DictionaryMap, SyntaxType } from '../types';

/**
 * Initial Seed Dictionary
 * These are common tags used in Stable Diffusion / Danbooru.
 * Keys should be lowercased for case-insensitive matching.
 */
export const SEED_DICTIONARY: DictionaryMap = {
  // --- Quality / Meta ---
  "masterpiece": { translation: "杰作", category: "画面质量" },
  "best quality": { translation: "最佳质量", category: "画面质量" },
  "high quality": { translation: "高质量", category: "画面质量" },
  "absurdres": { translation: "超高分辨率", category: "画面质量" },
  "8k": { translation: "8k分辨率", category: "画面质量" },
  "ultra detailed": { translation: "超细节", category: "画面质量" },
  "highly detailed": { translation: "高细节", category: "画面质量" },
  "raw photo": { translation: "原片", category: "风格" },
  "realistic": { translation: "写实", category: "风格" },
  "photorealistic": { translation: "照片级真实", category: "风格" },
  
  // --- Character (Base) ---
  "1girl": { translation: "1个女孩", category: "角色特征" },
  "1boy": { translation: "1个男孩", category: "角色特征" },
  "solo": { translation: "单人", category: "角色特征" },
  "smile": { translation: "微笑", category: "角色特征" },
  "long hair": { translation: "长发", category: "角色特征" },
  "short hair": { translation: "短发", category: "角色特征" },
  "blonde hair": { translation: "金发", category: "角色特征" },
  "blue eyes": { translation: "蓝眼", category: "角色特征" },
  "looking at viewer": { translation: "看镜头", category: "角色特征" },
  "blush": { translation: "脸红", category: "角色特征" },
  
  // --- Clothing ---
  "school uniform": { translation: "校服", category: "衣服特征" },
  "dress": { translation: "连衣裙", category: "衣服特征" },
  "skirt": { translation: "裙子", category: "衣服特征" },
  "shirt": { translation: "衬衫", category: "衣服特征" },
  "jeans": { translation: "牛仔裤", category: "衣服特征" },
  
  // --- Environment / Scene ---
  "outdoors": { translation: "户外", category: "场景" },
  "indoors": { translation: "室内", category: "场景" },
  "simple background": { translation: "简单背景", category: "场景" },
  "white background": { translation: "白背景", category: "场景" },
  "nature": { translation: "自然", category: "场景" },
  "sky": { translation: "天空", category: "场景" },
  "night": { translation: "夜晚", category: "场景" },
  "day": { translation: "白天", category: "场景" },
  
  // --- Camera / Angle ---
  "full body": { translation: "全身", category: "拍摄角度" },
  "upper body": { translation: "上半身", category: "拍摄角度" },
  "portrait": { translation: "肖像", category: "拍摄角度" },
  "cowboy shot": { translation: "七分身", category: "拍摄角度" },
  "from above": { translation: "俯视", category: "拍摄角度" },
  "from below": { translation: "仰视", category: "拍摄角度" },
  "close-up": { translation: "特写", category: "拍摄角度" },

  // --- Lighting ---
  "cinematic lighting": { translation: "电影光效", category: "光线效果" },
  "soft lighting": { translation: "柔光", category: "光线效果" },
  "volumetric lighting": { translation: "体积光", category: "光线效果" },
  "backlighting": { translation: "背光", category: "光线效果" },

  // --- Style ---
  "anime": { translation: "动画风格", category: "风格" },
  "oil painting": { translation: "油画", category: "风格" },
  "sketch": { translation: "素描", category: "风格" },
  "cyberpunk": { translation: "赛博朋克", category: "风格" },
};
