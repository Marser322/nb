import { DEFAULT_VISUAL_SKIN, VISUAL_SKINS, VISUAL_SKIN_STORAGE_KEY } from "@/lib/visual-skins";

/**
 * Script bloqueante inyectado en el <head> del documento (ver
 * `src/app/layout.tsx`) para eliminar el FOUC del selector de skins del
 * admin: lee el skin guardado en localStorage y lo aplica en
 * `<html data-visual-skin="...">` ANTES del primer paint, evitando el
 * flash dorado (skin default) al recargar en frío una ruta /admin con un
 * skin no-default guardado.
 *
 * Vive en el layout raíz (Server Component) y no en el layout del admin
 * porque un layout anidado no puede escribir en <head>. Por eso el script
 * primero chequea `location.pathname`: fuera de /admin no hace nada, para
 * no filtrar el atributo al sitio público (el aislamiento se completa en
 * `VisualSkinProvider`, que limpia el atributo al desmontarse al salir
 * del admin).
 *
 * Los ids de skin se generan desde `VISUAL_SKINS` (misma fuente que usa
 * el resto de la app) para que este script nunca quede desincronizado.
 */
export function VisualSkinInitScript() {
  const skinIds = VISUAL_SKINS.map((skin) => skin.id);

  const script = `(function(){try{
    if (!window.location.pathname.startsWith("/admin")) return;
    var ids = ${JSON.stringify(skinIds)};
    var key = ${JSON.stringify(VISUAL_SKIN_STORAGE_KEY)};
    var stored = window.localStorage.getItem(key);
    var skin = ids.indexOf(stored) !== -1 ? stored : ${JSON.stringify(DEFAULT_VISUAL_SKIN)};
    document.documentElement.dataset.visualSkin = skin;
  }catch(e){}})();`;

  return <script dangerouslySetInnerHTML={{ __html: script }} />;
}
