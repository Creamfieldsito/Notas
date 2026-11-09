# Notas

Bloc de notas simple para el celular. Las notas del día a día se escriben y listo;
las que tienen datos sensibles se pueden **proteger con un patrón o con 4 números**.

Es una app web instalable (PWA): se abre desde el navegador, se agrega a la pantalla
de inicio y funciona sin internet. No hay servidor ni cuentas: **las notas se guardan
solo en el celular**.

## Cómo se usa

- **＋ Nueva nota**: escribir título y contenido. Se guarda sola.
- **🔒 Proteger esta nota**: elegir patrón (uniendo al menos 4 puntos) o 4 números, y repetirlo para confirmar.
- Para abrir una nota protegida hay que dibujar el patrón o escribir los números.
- **⋮ Más → Guardar una copia**: descarga un archivo de respaldo. **Recuperar desde una copia** lo vuelve a cargar.

## Seguridad

- El contenido de una nota protegida se cifra con **AES-256-GCM** (Web Crypto del navegador).
  La llave se deriva del patrón o PIN con **PBKDF2-SHA256** (600.000 iteraciones) y una sal aleatoria por nota.
- El patrón o PIN **nunca se guarda**. Si se olvida, la nota no se puede recuperar.
- El **título** de una nota protegida **no** se cifra (se ve en la lista para poder encontrarla).
- Tras 5 intentos fallidos seguidos hay que esperar (30 s, 1 min, 2 min… hasta 10 min). La nota nunca se borra.
- La nota protegida se cierra sola al bloquear el celular, cambiar de app o tras 3 minutos sin uso.
- Las notas comunes **no** se cifran: las protege el bloqueo del propio celular.

### Límite honesto

Un PIN de 4 números tiene 10.000 combinaciones y un patrón unos cientos de miles.
Esto protege bien contra alguien que agarra el celular y abre la app (por el límite de intentos),
pero **no** contra alguien con conocimientos técnicos que logre copiar los datos del navegador:
podría probar todas las combinaciones en su computadora. Para datos muy críticos conviene
además tener el celular con bloqueo de pantalla.

## Desarrollo

```bash
npm install
npm run dev      # servidor local
npm test         # pruebas (cifrado, patrón, esperas)
npm run build    # genera dist/
```

Estructura:

| Archivo | Qué hace |
| --- | --- |
| `src/crypto.ts` | Cifrado y descifrado de notas protegidas |
| `src/db.ts` | Guardado local (IndexedDB) |
| `src/pads.ts` | Cuadrícula de patrón y teclado de PIN |
| `src/pattern-path.ts` | Lógica del patrón (puntos intermedios) |
| `src/lockout.ts` | Esperas tras intentos fallidos |
| `src/backup.ts` | Copia de seguridad |
| `src/main.ts` | Pantallas y navegación |
| `public/sw.js` | Funcionamiento sin internet |

## Publicación

El workflow `.github/workflows/deploy.yml` publica la app en GitHub Pages en cada push a `main`.
Hay que activar Pages en **Settings → Pages → Source: GitHub Actions**.
