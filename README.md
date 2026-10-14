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
npm run dev
```

Abre `/admin` y utiliza la contraseña preparada para este proyecto. El servidor comprueba
su huella scrypt en `server/admin-credentials.json`; la contraseña original no está en
el código ni en el navegador. `npm run dev` prepara automáticamente una clave privada
de sesión en `.private/`, que no se sube a Git. No necesitas `ADMIN_SESSION_SECRET`.

Para cambiar la contraseña, define `ADMIN_PASSWORD` de 12 a 200 caracteres en la
configuración privada del entorno y ejecuta `npm run admin:password -- --replace`.
El comando guarda solamente una nueva huella. Sube ese archivo y despliega para aplicar
el cambio en Vercel. Nunca pases la contraseña como argumento de una orden ni la publiques.
Si defines una `ADMIN_PASSWORD` válida en el servidor, tiene prioridad como reemplazo
opcional; una variable vacía o incorrecta no bloquea la contraseña preparada.

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
   `/api/*` mediante `api/index.ts`. Selecciona Node 24 y el comando de compilación
   **`npm run build`**, sin reemplazarlo por `vite build`. La compilación prepara una
   clave privada de sesión que se incluye solamente en la función del servidor.
2. Conecta una base **PostgreSQL persistente**, por ejemplo Neon desde el almacenamiento
   de Vercel. Usa la URL de conexión del proveedor en `DATABASE_URL`, solo en el servidor.
   El usuario de conexión necesita crear y acceder a las tablas en su esquema al primer inicio.
   Las tablas `products`, `orders` y `reservations` se crean automáticamente, conservando
   productos existentes. Usa bases distintas para Production y Preview.
3. En las variables privadas del proyecto define:

   | Variable | Valor/configuración |
   |---|---|
   | `DATABASE_URL` | Conexión PostgreSQL privada del proveedor; en Neon usa la conexión agrupada (pooled). También se acepta `POSTGRES_URL` si la integración crea ese nombre. |
   | `APP_URL` | Dominio definitivo HTTPS, sin ruta, por ejemplo tu URL de Vercel. Se utiliza para los retornos de pago; el administrador acepta también el dominio real servido por la aplicación. |
   | `WEBPAY_ENV` | `link`, según tu flujo actual. |
   | `WEBPAY_FORM_ID` | Opcional: reemplaza `114823`, formulario original que el servidor usa automáticamente. Verifica que sea el de tu comercio. |
   | `RESERVATION_TTL_MINUTES` | `30` por defecto; ajustable hasta 1440 (24 horas). |

   No uses el prefijo `VITE_` para las claves: las expondría al navegador. El panel puede
   abrirse desde el dominio propio o de Vercel que sirve el mismo despliegue; no requiere
   cambiar `APP_URL` por cada alias. En Preview, usa una base de prueba separada.
   El acceso por contraseña ya está preparado; no exige variables administrativas.
4. Despliega o vuelve a desplegar después de definir las variables. En `/admin` → Ajustes,
   comprueba que SQL tenga una conexión verificada y que Webpay esté configurado.
5. Revisa el catálogo, precios, unidades físicas y pedidos; realiza una compra controlada
   antes de abrir ventas. La publicación en Vercel y un cobro real requieren tu configuración.

### Crear Neon desde Vercel

En la cuenta de Vercel abre el proyecto asociado a `praosparfum-drab.vercel.app`.
En **Storage → Create Database** elige **Neon**, crea una base en el plan gratuito
y conéctala al proyecto para **Production**. Si el panel ofrece una región cercana a
São Paulo, úsala para reducir la demora con la región `gru1` de la aplicación.

La integración añade la conexión privada al proyecto. Comprueba únicamente que exista
`DATABASE_URL` o `POSTGRES_URL`; no publiques su valor. Si configuraste un prefijo
personalizado para los nombres, añade la conexión agrupada como `DATABASE_URL` en las
variables privadas de Vercel. No se utiliza `POSTGRES_PRISMA_URL` ni una URL HTTP como
conexión PostgreSQL. Después vuelve a desplegar el último commit de `main`.

En `/admin` → Ajustes debe aparecer **Almacenamiento: PostgreSQL** con la conexión
verificada. El primer acceso crea las tablas y los 46 productos iniciales. Los siguientes
inicios conservan los productos editados y su stock. Revisa las unidades físicas antes
de aceptar pedidos. Los datos sobreviven a despliegues porque se guardan en Neon.

Crear y conectar la base requiere la sesión de tu cuenta de Vercel/Neon. Este repositorio
no incluye esa conexión ni crea cuentas automáticamente. Conecta bases de prueba
distintas para Preview; elige solo Production para la base real de la tienda.

Si la base dice **Available** pero la tienda sigue sin conexión, abre `/admin` → Ajustes.
La sección **Comprobación de este despliegue** muestra el entorno y si `DATABASE_URL`
y `POSTGRES_URL` están ausentes, vacías o tienen valor. También identifica nombres con
prefijo que la aplicación todavía no utiliza. No muestra la conexión, usuario ni contraseña.
Compara ese resultado con las variables del proyecto; una base creada necesita estar
conectada al proyecto y sus variables incorporadas en un nuevo despliegue de Production.

Si la integración no añade la variable, en Neon pulsa **Connect**, activa la conexión
agrupada (**Connection pooling**) y copia únicamente la URL que empieza por
`postgresql://`. Guárdala de forma privada como `DATABASE_URL` en **Vercel → Settings →
Environment Variables → Production**, guarda y vuelve a desplegar. La URL contiene
credenciales: no la pegues en el chat, GitHub ni el código del navegador.

### Si no puedes entrar al administrador

Despliega el último commit de `main` en el proyecto que sirve
`https://praosparfum-drab.vercel.app/admin`. Si el mensaje todavía exige
`ADMIN_PASSWORD` o `ADMIN_SESSION_SECRET`, estás usando una versión anterior.

Si el mensaje indica que falta el archivo privado de sesión, revisa en
**Settings → Build and Deployment** que el comando sea `npm run build` y vuelve a
desplegar. El archivo se genera automáticamente antes de empaquetar la función.
`ADMIN_SESSION_SECRET` dejó de utilizarse. Una `ADMIN_PASSWORD` válida guardada en
Vercel sigue reemplazando la contraseña preparada; elimina ese reemplazo si deseas
volver a la contraseña del proyecto.

Entrar al panel funciona aunque todavía falte PostgreSQL. Sin `DATABASE_URL`, los
productos, pedidos e inventario de producción no pueden leerse ni guardarse: el
panel de Ajustes muestra el estado de esa conexión. Las variables de Codex no configuran
la base de datos del despliegue de Vercel.

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

La configuración inicial usa el formulario público `114823` incluido en el proyecto.
Funciona aunque `WEBPAY_FORM_ID` no esté en Vercel. Una variable con otro número válido
lo reemplaza; un valor explícito inválido bloquea el pago. Esto no activa Webpay Plus.

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
la contraseña o realizar una nueva compilación invalida las sesiones anteriores.
La clave permanece estable entre instancias y reinicios de un mismo despliegue.
La huella scrypt lleva sal aleatoria y no permite iniciar sesión por sí sola. Como
una copia de esa huella permite probar contraseñas fuera de línea, usa una contraseña
difícil de adivinar y conserva el repositorio privado. La clave de sesión se genera
con aleatoriedad independiente, nunca a partir de la huella pública.
Salir elimina
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
