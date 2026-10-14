# Auditoría de Práos Parfum

Fecha de revisión: 13 de octubre de 2026 (America/Santiago).
Alcance: ZIP entregado, administrador, catálogo, checkout, inventario, persistencia y
configuración para GitHub/Vercel. El informe antiguo del ZIP no se tomó como prueba
suficiente de funcionamiento.

## Hallazgos y correcciones

| Severidad | Hallazgo del ZIP | Corrección implementada |
|---|---|---|
| Crítica | La sesión era la contraseña y se almacenaba en localStorage; contraseña de respaldo incorporada. | Contraseña explícita en configuración privada, cookie HttpOnly firmada y caducidad, protección de Origin en escrituras. |
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
- Los datos sensibles y claves no van a GitHub. Los backups deben configurarse en SQL.
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
