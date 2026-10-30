/// <reference types="astro/client" />
declare namespace App {
  interface Locals {
    staff?: import('./lib/auth').Staff;
    locale?: import('./lib/i18n').Locale;
    publicPath?: string;
    consentCallback?: string;
  }
}
declare namespace Cloudflare {
  interface Env {
    MARKETING_HASH_KEY?: string;
  }
}
