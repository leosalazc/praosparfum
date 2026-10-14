# Auditoría de Práos Parfum

Fecha de revisión: 13 de octubre de 2026 (America/Santiago).
Alcance: ZIP entregado, administrador, catálogo, checkout, inventario, persistencia y
configuración para GitHub/Vercel. El informe antiguo del ZIP no se tomó como prueba
suficiente de funcionamiento.

## Hallazgos y correcciones

| Severidad | Hallazgo del ZIP | Corrección implementada |
|---|---|---|
| Crítica | La sesión era la contraseña y se almacenaba en localStorage; contraseña de respaldo incorporada. | Huella scrypt de una contraseña elegida por el propietario, clave privada de sesión por despliegue, cookie HttpOnly firmada con caducidad y protección de Origin en escrituras. |
| Alta | La edición de productos dependía de una cuenta Firebase. | CRUD protegido en SQL, fotos, precios, visibilidad y stock desde el administrador; SDK/configuración Firebase eliminados. |
| Alta | Pedidos en JSON `/tmp` de Vercel podían desaparecer o divergir entre instancias. | PostgreSQL obligatorio en Vercel; SQLite transaccional solo local/servidor persistente autorizado. |
| Alta | Comprobar stock y descontarlo eran pasos independientes; dos compradores podían comprar la última unidad. | Reserva SQL atómica con vencimiento; bloqueo a nivel de base de datos. |
| Alta | Dos confirmaciones podían descontar dos veces; el navegador podía indicar stockApplied. | Pago e inventario se actualizan en la misma transacción; indicador interno protegido e idempotencia. |
| Alta | Guardar una ficha abierta antes de una venta podía restaurar el stock anterior. | No guardar stock sin cambios y comparación atómica del stock esperado para ajustes. |
| Alta | Un retorno de cancelación podía filtrar la clave pública del pedido por identificador adivinado. | Requiere token y sesión coincidentes; retorno automático validado también por importe/pedido. |
| Media | Catálogo oculto se exponía públicamente y podía verse desactualizado por CDN/caché. | Endpoint público filtra ocultos, respuestas no-store y consultas visibles cada cinco segundos. |
| Media | Catálogo vacío o error SQL recuperaba productos antiguos incluidos en el cliente. | Catálogo autoritativo vacío/error sin ofertas de respaldo, errores visibles y reintento. |
| Media | La URL `status=success` podía mostrar pago confirmado y vaciar carrito sin prueba del servidor. | Estado mostrado y limpieza del carrito dependen del pedido verificado en el servidor. |
| Media | Errores async de Express 4 podían dejar solicitudes sin respuesta. | Wrappers async y respuestas JSON centralizadas. |
| Alta | `.gitignore` ignoraba cualquier carpeta `data`, incluyendo `src/data`; un primer push omitía el catálogo y rompía la compilación. | Exclusión limitada a `/data/` de runtime; los datos fuente se incluyen en Git. |
| Media | Avanzar un pedido pagado podía ignorar seguimiento/estado. | Transiciones de despacho verificadas y persistidas, sin volver a descontar inventario. |
| Alta | La auditoría npm inicial tras retirar Firebase detectó 13 avisos: 1 crítico, 7 altos y 5 moderados. | Actualizaciones compatibles y Nodemailer 10.1; auditoría final: cero vulnerabilidades conocidas. |

## Límites que requieren configuración real

- Botón Webpay.cl: la tienda no recibe una confirmación automática. El administrador
  debe verificar evidencia del pago y el importe exacto en Transbank antes de confirmar.
- PostgreSQL remoto y Vercel aún requieren una cuenta/base y configuración del propietario.
  Pruebas locales de PostgreSQL no demuestran una publicación ni acceso a una base remota.
- Sin SMTP no se envían correos; no se enviaron mensajes ni se realizaron cobros reales
  durante esta revisión. SMTP y Webpay Plus reales no fueron validados.
- El ZIP incluye el catálogo base y los archivos gráficos adjuntos; no contiene historial
  de ventas ni las fotos que pudieran existir únicamente en Firebase. No se migraron esos datos.
- El inventario es por referencia y compartido entre tamaños. Las devoluciones financieras
  requieren gestión explícita con Transbank; cambiar el estado de despacho no reembolsa dinero.
- Los pedidos, contraseñas originales y claves de sesión no van a GitHub. El repositorio
  contiene la huella scrypt de acceso; mantenlo privado para limitar intentos de descifrado
  fuera de línea. Los backups deben configurarse en SQL.
- Limitación actual de escala: rate limiting por instancia y bloqueo global de transacciones
  breves. Para tráfico alto se recomienda protección compartida y optimizar lecturas/bloqueos.
- Cerrar sesión borra la cookie local; invalidación inmediata de una copia requiere rotar
  contraseña/clave. La sesión caduca en ocho horas.

## Validación ejecutada

- `npm ci` ejecutado con el lockfile final: instalación reproducible sin modificar dependencias.
- `npm run lint`: comprobación de TypeScript aprobada.
- `npm run build`: frontend y servidor de producción generados correctamente.
- `npm test`: 21 pruebas aprobadas con SQLite; cero fallos, omisiones o pruebas canceladas.
- Las mismas 21 pruebas aprobadas usando PostgreSQL 17 real en Docker, con esquemas de
  prueba aislados y eliminados después de la ejecución.
- Servidor Node construido en modo producción con PostgreSQL: catálogo de 46 productos,
  página administrativa, assets y sesión Secure/HttpOnly verificados mediante HTTP local.
- Servidor de desarrollo iniciado y comprobado en el checkout definitivo.
- Chromium: 13 comprobaciones funcionales aprobadas, incluyendo creación/edición,
  fotos, dos contextos independientes, inventario, compra pendiente, confirmación manual,
  avance de despacho, errores controlados, catálogo vacío y cierre de sesión.
- Tres comprobaciones adicionales de fuentes locales aprobadas; cero peticiones a
  Google Fonts. Las fuentes originales se sirven desde el proyecto porque su dominio
  estaba bloqueado en este entorno. Administrador/checkout a 380 px sin desbordamiento.
- Cero excepciones JavaScript; los 401 iniciales y 503 provocados por pruebas de fallo
  fueron resultados esperados, no comprobaciones omitidas.
- Rechazo de PostgreSQL sin TLS cuando la conexión exige TLS verificado; sin fallback.
- `npm audit --audit-level=low`: cero vulnerabilidades conocidas a fecha de revisión.

Estas pruebas se hicieron con datos aislados y sin enviar pagos ni correos reales.
No prueban que el proyecto ya esté publicado, que una base remota esté conectada ni
que el formulario del comercio haya cobrado un importe real.

## Corrección de acceso desde dominios de Vercel y proxies HTTPS

14 de octubre de 2026: el administrador comparaba el origen exclusivamente con
`APP_URL`, bloqueando el login desde un alias legítimo o cuando el proxy terminaba
HTTPS delante de Express. La validación ahora reconoce el dominio y puerto que
sirve la aplicación, mantiene `APP_URL` como respaldo explícito para un proxy con
Host interno y exige HTTPS en producción. No autoriza dominios por comodín ni
confía en X-Forwarded-Host/Proto del cliente. Las solicitudes de otros sitios,
los orígenes ausentes o malformados y los puertos/dominios diferentes se rechazan.
Las nueve nuevas pruebas cubren login y escritura reales con APP_URL desactualizado,
terminación HTTPS y los casos negativos de protección CSRF. La suite completa actual
tiene 30 pruebas aprobadas; también pasaron TypeScript y el build de producción.

## Diagnóstico de configuración administrativa

14 de octubre de 2026: el mensaje de login mencionaba ambas variables aunque solo
fallara una. Ahora identifica la variable y si está ausente, vacía o fuera del rango,
sin revelar valores ni longitudes reales. La clave estable de sesión también es
obligatoria cuando VERCEL=1. Los reintentos durante una configuración incompleta no
agotan el límite de intentos de contraseña; el límite sigue activo para logins con
configuración válida. Codex y el proyecto publicado en Vercel requieren configuración
independiente; las variables de uno no se transfieren al otro. La suite actual de
36 pruebas pasó, al igual que TypeScript y el build de producción.

## Acceso por contraseña sin variables administrativas obligatorias

14 de octubre de 2026: tras comprobar que las variables de Codex no estaban disponibles
en el despliegue de Vercel, se preparó una alternativa solicitada por el propietario.
Esta sección reemplaza el requisito administrativo de las secciones anteriores.

El servidor guarda una huella scrypt con sal aleatoria, coste N=131072, r=8, p=1 y
32 bytes de resultado. La contraseña original se procesa en memoria y no se escribe
en el código. Una `ADMIN_PASSWORD` válida sigue siendo un reemplazo opcional;
las variables antiguas inválidas no bloquean el acceso y `ADMIN_SESSION_SECRET`
dejó de utilizarse. La huella nunca sirve como contraseña ni como clave de sesión.

`npm run build` genera una clave aleatoria independiente de 48 bytes en `.private/`.
Vercel incluye ambos archivos únicamente en la función del servidor. La clave permanece
estable entre instancias de un despliegue; cada nueva compilación invalida las sesiones
anteriores. Los archivos ausentes o corruptos bloquean el acceso de forma segura.
Los endpoints y el servidor de Vite rechazan las rutas privadas. Scrypt se ejecuta
fuera del hilo de peticiones, con dos verificaciones simultáneas y 16 en espera.

Validación de esta alternativa:

- 40 pruebas aprobadas, cero fallos u omisiones: acceso en producción/Vercel sin
  ambas variables, rechazo de contraseña incorrecta, sesiones entre procesos,
  manipulación/caducidad/rotación, archivos corruptos, saturación y regresiones de stock.
- TypeScript y compilación de frontend/servidor aprobados.
- Builder oficial `@vercel/node` 24.0.0 y `@vercel/build-utils` 14.21.0 ejecutado
  en copia aislada: función Node 24 con el verificador y la clave privada incluidos.
- Ninguna contraseña original ni clave de sesión en archivos destinados a Git;
  ningún verificador, sal ni clave privada en `dist` o `public`.
- Preparación repetible, rotación al compilar y conservación de archivos desconocidos
  comprobadas en directorios temporales aislados.
- Chromium: 10 comprobaciones aprobadas con ambas variables ausentes del servidor:
  login correcto/incorrecto, cookies privadas, sesión tras recargar, cierre de sesión,
  catálogo de 46 productos y Ajustes con SQLite aislada. Ocho rutas privadas rechazadas
  sin contenido confidencial, incluidas `/@fs`, `?raw` y variantes codificadas.

La web consultada aún devuelve falta de `DATABASE_URL`. Este cambio permite autenticarse
sin esa conexión, pero no sustituye PostgreSQL para guardar productos, pedidos o stock.

## Preparación de Neon desde Vercel

14 de octubre de 2026: el propietario eligió PostgreSQL con Neon y creación desde Vercel.
El servidor acepta `DATABASE_URL` y también `POSTGRES_URL`, conservando la prioridad de
la primera. Las variables vacías no habilitan SQLite en Vercel. Se mantiene TLS con
verificación de certificados y bloqueo transaccional compatible con el pooler de Neon.

La carga inicial de los 46 productos ahora utiliza una sola consulta parametrizada,
en lugar de 46 llamadas por instancia nueva. Los registros existentes no se sustituyen:
se conservan stock, precios y fichas editadas. El administrador y el README indican
cómo conectar la integración Neon al proyecto de producción.

Las suites de API e inventario pasaron 20 pruebas con PostgreSQL 17 real y esquemas
temporales aislados. La suite completa pasó 42 pruebas; TypeScript y el build también.
Además, dos procesos separados en producción/Vercel usando solo `POSTGRES_URL`
comprobaron catálogo, edición persistente, reserva y ocho confirmaciones simultáneas
con un único descuento de stock. El segundo proceso recuperó los datos sin volver a
descontar ni restaurar el catálogo inicial. El contenedor y las credenciales de prueba
se eliminaron. Esto comprueba PostgreSQL local; la conexión remota a Neon aún
depende de crear la base, conectar la integración y volver a desplegar en Vercel.

## Diagnóstico del despliegue que recibe la conexión

Ante una base Neon en estado Available pero una tienda que aún no recibe la conexión,
el estado administrativo incluye nombres y estados de las dos variables admitidas,
variables de conexión con prefijo, entorno del despliegue y commit abreviado. Nunca
incluye URLs de conexión, usuario, contraseña ni otros valores del entorno.
El panel muestra esa comprobación cuando el almacenamiento no está listo.

Solo las sesiones administrativas pueden consultar este diagnóstico; la respuesta es
privada y no se almacena en caché. No cambia la selección de base ni debilita TLS.
La suite completa pasa 47 pruebas, incluidas cinco sobre filtrado de secretos, límites
del diagnóstico, ausencia de conexión y rechazo de acceso sin sesión. TypeScript y la
compilación de frontend/servidor también pasan.

## Conexión real de producción verificada

14 de octubre de 2026: `https://praosparfum-drab.vercel.app` confirmó PostgreSQL
configurado y disponible en el despliegue Production `8057110`. El catálogo público
respondió HTTP 200 con 46 productos e inventario no negativo; las listas privadas de
productos y pedidos respondieron 200 con sesión, y el acceso anónimo a productos
administrativos devolvió 401. El login y el cierre de sesión respondieron 200.
No se editaron fichas, crearon pedidos reales ni enviaron pagos o correos para comprobarlo.

Se detectó que el botón Webpay seguía bloqueado por una variable ausente. Se restauró
el formulario público `114823`, comprobado en el proyecto original, como valor inicial
cuando `WEBPAY_FORM_ID` falta o está vacío. Un reemplazo numérico válido se conserva y
un valor explícito inválido sigue bloqueando el pago. Se mantiene la confirmación
manual del importe recibido; no se activó Webpay Plus ni se realizó un cobro real.
El envío de correo no tiene credenciales configuradas en producción.
La suite completa pasa 49 pruebas, incluidas las nuevas regresiones de formulario
ausente/vacío, reemplazo inválido y conservación del stock hasta confirmar el pago.
TypeScript y el build de frontend/servidor pasan.
Los runners de API/inventario/origen aíslan también `POSTGRES_URL`, para que una
integración heredada no dirija las pruebas a la tienda real. Las 49 pruebas pasaron
incluso al inyectar un alias PostgreSQL sintético que nunca debe utilizarse.
