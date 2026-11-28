import { getObject } from '../../infrastructure/storage/storage.js';
import { readBytes } from './media_bytes.rules.js';

/**
 * Bir `media_files` satırının baytlarını döndürür (satır: data, storage_key, size_bytes, sha256 içermeli).
 * Veritabanı kopyası silinmişse depodan (R2) okur ve doğrular. cfg = r2Config(await getConfig()).
 */
export const readMediaBytes = (row, cfg) => readBytes(row, { cfg, get: getObject });
