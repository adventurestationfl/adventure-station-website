/// <reference types="astro/client" />
declare namespace App {
  interface Locals {
    staff?: import('./lib/auth').Staff;
  }
}
