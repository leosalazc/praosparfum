# Práos Parfum

Tienda React + Vite + Express con catálogo, pedidos e inventario en SQL. No usa Firebase.
Las fuentes incluidas se sirven localmente, sin depender de Google Fonts.
GitHub guarda el código; PostgreSQL guarda los datos de la tienda en producción.

## Desarrollo

Requiere Node 24 recomendado (mínimo 22.13), npm y el checkout existente.

```bash
cd /workspace/praosparfum
npm ci
cp .env.example .env
# Completa ADMIN_PASSWORD y ADMIN_SESSION_SECRET en el archivo privado.
npm run dev
```

Abre `/admin` en el servidor local. `ADMIN_PASSWORD` es una contraseña elegida por ti,
entre 12 y 200 caracteres. `ADMIN_SESSION_SECRET` es una clave aleatoria independiente
de al menos 32 caracteres. No hay contraseña predeterminada. No publiques estas claves.
Puedes generar la clave de sesión con `node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"`
y guardarla únicamente en la configuración privada.

Sin `DATABASE_URL`, desarrollo usa `data/praos.sqlite`, persistente entre reinicios locales.
Se carga una sola vez el catálogo inicial del ZIP: **revisa el stock físico real antes de vender**.
Las fotos y el historial que no están en el ZIP no se pueden reconstruir automáticamente.
No se consulta una base Firebase anterior ni se usa un catálogo de respaldo si falla SQL.

```bash
npm run lint   # comprobación de tipos
npm test       # pruebas aisladas; no cobra ni envía correos reales
npm run build  # genera dist y server-dist
```

`npm run preview` sirve únicamente el frontend; para probar compras y administrador usa
`npm run dev` o el servidor completo de producción.

## Publicar en Vercel

1. Importa `leosalazc/praosparfum` desde GitHub. `vercel.json` sirve `dist` y las rutas
   `/api/*` mediante `api/index.ts`. Selecciona Node 24.
2. Conecta una base **PostgreSQL persistente**, por ejemplo Neon desde el almacenamiento
   de Vercel. Usa la URL de conexión del proveedor en `DATABASE_URL`, solo en el servidor.
   El usuario de conexión necesita crear y acceder a las tablas en su esquema al primer inicio.
   Las tablas `products`, `orders` y `reservations` se crean automáticamente, conservando
   productos existentes. Usa bases distintas para Production y Preview.
3. En las variables privadas del proyecto define:

   | Variable | Valor/configuración |
   |---|---|
   | `DATABASE_URL` | Conexión PostgreSQL privada del proveedor. |
   | `ADMIN_PASSWORD` | Tu contraseña privada de 12 a 200 caracteres. |
   | `ADMIN_SESSION_SECRET` | Clave aleatoria privada de al menos 32 caracteres. |
   | `APP_URL` | Dominio definitivo HTTPS, sin ruta, por ejemplo tu URL de Vercel. Se utiliza para los retornos de pago; el administrador acepta también el dominio real servido por la aplicación. |
   | `WEBPAY_ENV` | `link`, según tu flujo actual. |
   | `WEBPAY_FORM_ID` | `114823`, formulario incluido en el proyecto entregado. Verifica que sea el de tu comercio. |
   | `RESERVATION_TTL_MINUTES` | `30` por defecto; ajustable hasta 1440 (24 horas). |

   No uses el prefijo `VITE_` para las claves: las expondría al navegador. El panel puede
   abrirse desde el dominio propio o de Vercel que sirve el mismo despliegue; no requiere
   cambiar `APP_URL` por cada alias. En Preview, usa una base y claves de prueba separadas.
4. Despliega o vuelve a desplegar después de definir las variables. En `/admin` → Ajustes,
   comprueba que SQL tenga una conexión verificada y que Webpay esté configurado.
5. Revisa el catálogo, precios, unidades físicas y pedidos; realiza una compra controlada
   antes de abrir ventas. La publicación en Vercel y un cobro real requieren tu configuración.

### Si no puedes entrar al administrador

Las variables de **Codex** configuran el entorno de desarrollo. La web publicada
necesita sus propias variables en **Vercel**, en el proyecto asociado al dominio
que estás abriendo. Si has importado el repositorio de nuevo, revisa el proyecto
correspondiente a la nueva dirección.

En ese proyecto abre **Settings → Environment Variables**, selecciona **Production**
y guarda el nombre exacto `ADMIN_PASSWORD` con tu contraseña como valor, y
`ADMIN_SESSION_SECRET` con una clave aleatoria independiente de 32 caracteres o más.
Los valores no deben ser los nombres de las variables ni las explicaciones del ejemplo.
Después usa **Redeploy** sobre el último despliegue de producción: cambiar las variables
no actualiza los procesos de un despliegue existente.

El login ahora indica cuál variable está ausente, vacía o fuera del rango aceptado,
sin mostrar su contenido. Si sigues viendo el mensaje antiguo que menciona ambas
variables, el despliegue todavía no contiene esta mejora de diagnóstico. Elige el
último commit de main antes de volver a desplegar.

La conexión PostgreSQL remota siempre verifica TLS y sus certificados. Para una CA privada
configura `DATABASE_SSL_CA` con el PEM autorizado o `PGSSLROOTCERT` en un servidor Node.
No se acepta una base SQLite dentro de Vercel: sus discos temporales perderían datos.
En un servidor Node con volumen persistente, puedes optar explícitamente por SQLite
con `ALLOW_SQLITE_PRODUCTION=true` y `SQLITE_FILE` absoluto fuera de `/tmp`.

## Administrar productos y pedidos

- **Productos:** crea referencias M/F/U + número; edita nombre, marca, categoría, tamaños,
  precios, foto y unidades físicas. Oculta o muestra referencias sin perder su historial.
  Las fotos comprimidas por el panel quedan en la base SQL y se sirven mediante la API.
- **Inventario:** muestra físico, reservado y disponible. El disponible es físico menos
  reservado. Las variantes 60/100ml comparten el inventario de la referencia; para
  inventario independiente usa referencias distintas. No ajustes el stock físico por
  debajo de las reservas activas. Si otro pedido modifica el stock mientras editas, se
  pide recargar antes de sustituirlo; editar solo el nombre/foto/precio no cambia unidades.
- **Pedidos:** confirma pagos, avanza a Preparando → Enviado → Entregado, guarda seguimiento
  y notas. No se pueden retroceder estados pagados ni simular una devolución con Cancelado.
  Las devoluciones/reembolsos se gestionan con Transbank y un ajuste físico explícito.
- **Actualización:** los cambios del administrador refrescan su vista de inmediato; otras
  pestañas visibles consultan el servidor cada cinco segundos y al recuperar el foco.
  Es actualización automática por consulta periódica, no una conexión de eventos permanente.

## Compra con tu botón Webpay

1. El servidor calcula precios, envío y total desde SQL; valida todas las variantes.
2. Crea el pedido pendiente y reserva unidades en una transacción. Dos clientes no pueden
   reservar la misma última unidad. No se descuenta aún el inventario físico.
3. El cliente accede al formulario Webpay con el importe precargado. **Este botón no
   avisa a la tienda cuando paga y puede permitir editar el monto.**
4. Comprueba en Transbank el pago recibido, importe y correspondencia con el cliente/pedido.
   En `/admin` → Pedidos → Por confirmar pago pulsa **Confirmar pago recibido**.
5. El servidor marca el pago y descuenta el stock físico de forma atómica una sola vez.
   Repetir la confirmación o recibir llamadas simultáneas no vuelve a descontar unidades.

Cancelar o rechazar un pedido pendiente libera su reserva. Las reservas vencidas se
liberan en la siguiente operación del catálogo/pedidos (no hace falta un cron).
Un pedido vencido puede confirmarse si aún hay unidades libres; si no, se bloquea la
confirmación y se pide resolver stock/pago con el cliente. Ajusta el plazo de reserva
si tus confirmaciones manuales suelen tardar más de 30 minutos.

El pedido conserva su precio al crearlo aunque edites el catálogo después. El cliente
solo ve el resumen con una clave de acceso aleatoria; el resto se protege mediante
la sesión de administrador.

## Correo y Webpay Plus opcionales

Para correos agrega `SMTP_USER` y `SMTP_PASS`; Gmail requiere contraseña de aplicación.
Opcionales: `SMTP_HOST`, `SMTP_PORT`, `SMTP_FROM`, `NOTIFY_EMAIL`. TLS se mantiene verificado.
El estado del pedido distingue envío, error y ausencia de configuración. Sin SMTP, se
pueden administrar productos, comprar y confirmar pagos; no llegan avisos por correo.
El panel permite reenviar confirmaciones de pedidos pagados tras corregir SMTP.

Si contratas Webpay Plus en el futuro, usa `WEBPAY_ENV=production`,
`WEBPAY_COMMERCE_CODE`, `WEBPAY_API_KEY` y `APP_URL` HTTPS. Solo entonces la autorización
válida confirma automáticamente el pago. `WEBPAY_ENV=integration` usa transacciones de
prueba. El retorno debe coincidir con el token, pedido, sesión e importe guardados.
Si una autorización llega tarde sin stock libre, se registra el pago con una alerta
para revisar disponibilidad; nunca se toma inventario reservado por otro cliente.

## Seguridad y mantenimiento

La sesión administrativa usa cookie HttpOnly, SameSite=Strict y Secure en producción,
con vencimiento a las ocho horas. No se guarda la contraseña en localStorage. Cambiar
`ADMIN_PASSWORD` o `ADMIN_SESSION_SECRET` invalida las sesiones anteriores. Salir elimina
la cookie del navegador; una copia robada sigue vigente hasta su expiración o rotación.
Las escrituras administrativas exigen un Origin válido que coincida con el dominio y
puerto que sirve la petición, o con `APP_URL` como origen público configurado para un
proxy con Host interno. En producción se exige HTTPS. Se rechazan solicitudes que el
navegador identifica como provenientes de otro sitio y no se confía en encabezados
forwarded enviados por el cliente. `APP_URL` no limita el login al dominio canónico.

El límite de intentos actual vive por instancia: en un despliegue con muchas instancias
activa también reglas compartidas de protección en Vercel/WAF antes de tráfico masivo.
`TRUST_PROXY=1` solo es válido con un único proxy inverso confiable y Node sin acceso
público directo. PostgreSQL serializa operaciones cortas de inventario mediante bloqueo
transaccional; para tráfico grande conviene separar lecturas y ampliar este diseño.
Configura backups/restauración del proveedor SQL. GitHub no respalda pedidos ni datos SQL.

Fotos estáticas opcionales: `npm run export-images` exporta las imágenes actuales de SQL a
`public/products/` y actualiza `src/data/productImages.ts`; revisa esos cambios de código
antes de subirlos. Las nuevas fotos del administrador funcionan sin ejecutar esta tarea.
