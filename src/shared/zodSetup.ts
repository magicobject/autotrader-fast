// Imported first by every entry point. Zod normally tries to compile validators with
// new Function(), which extension pages and Autotrader's own security policy forbid; jitless
// mode skips that attempt so no policy violation is ever reported.
import * as z from 'zod/mini';

z.config({ jitless: true });
