import { useEffect, useState } from 'react';
import { CheckCircle2, AlertTriangle, Mail } from 'lucide-react';
import { adminFetch } from './api';

type Status = {
  email: { configured: boolean; notifyTo: string };
  webpay: { mode: 'boton' | 'produccion' | 'integracion'; formId: string; configured: boolean; error?: string };
  storage: { mode: 'postgres' | 'sqlite' | 'unconfigured'; configured: boolean; persistent: boolean; ready: boolean; error?: string };
  adminConfigured: boolean;
  sessionConfigured: boolean;
};

function Row({ ok, title, children }: { ok: boolean; title: string; children: React.ReactNode }) {
  return (
    <div className="bg-white rounded-xl border border-neutral-200 p-4 flex gap-3">
      {ok ? <CheckCircle2 className="w-5 h-5 text-green-600 shrink-0" /> : <AlertTriangle className="w-5 h-5 text-amber-500 shrink-0" />}
      <div className="text-sm space-y-1 min-w-0">
        <p className="font-semibold">{title}</p>
        {children}
      </div>
    </div>
  );
}

export function SettingsTab() {
  const [status, setStatus] = useState<Status | null>(null);
  const [error, setError] = useState('');
  const [sending, setSending] = useState(false);

  useEffect(() => {
    adminFetch<Status>('/api/admin/status').then(setStatus).catch((e) => setError(e.message));
  }, []);

  if (error) return <p className="text-sm text-red-600 bg-red-50 p-3 rounded-lg" role="alert">{error}</p>;
  if (!status) return <p className="text-sm text-neutral-400">Cargando…</p>;

  const code = 'bg-neutral-100 px-1 rounded font-mono text-xs';
  return (
    <div className="space-y-3 max-w-2xl">
      <Row ok={status.storage.configured && status.storage.ready && status.storage.persistent && !status.storage.error} title={`Almacenamiento: ${status.storage.mode === 'postgres' ? 'PostgreSQL' : status.storage.mode === 'sqlite' ? 'SQLite local (desarrollo)' : 'sin configurar'}`}>
        {status.storage.mode === 'postgres' ? (
          <p className="text-neutral-600">Los productos y pedidos se guardan en PostgreSQL. Las reservas y el descuento de stock se procesan con transacciones en el servidor.</p>
        ) : status.storage.mode === 'sqlite' ? (
          <p className="text-neutral-600">Puedes editar el catálogo y probar pedidos en este entorno. Para desplegar en Vercel, configura una base de datos PostgreSQL mediante <span className={code}>DATABASE_URL</span>: los archivos locales del servidor no son almacenamiento permanente allí.</p>
        ) : (
          <p className="text-neutral-600">Conecta una base Neon desde la sección Storage de tu proyecto en Vercel. La conexión debe quedar guardada como <span className={code}>DATABASE_URL</span> o <span className={code}>POSTGRES_URL</span>. Después vuelve a desplegar para activar productos, pedidos e inventario.</p>
        )}
        {status.storage.error && <p className="text-red-700" role="alert">{status.storage.error}</p>}
      </Row>

      <Row ok={status.adminConfigured && status.sessionConfigured} title="Acceso de administrador">
        <p className="text-neutral-600">El acceso usa tu contraseña y una cookie protegida. La sesión se prepara automáticamente al desplegar.</p>
        {(!status.adminConfigured || !status.sessionConfigured) && <p className="text-red-700">El acceso no se preparó correctamente. Vuelve a desplegar la versión más reciente.</p>}
      </Row>

      <Row ok={status.webpay.configured && status.webpay.mode !== 'integracion'} title={`Webpay: ${status.webpay.mode === 'boton' ? `botón de pago (formulario ${status.webpay.formId})` : status.webpay.mode === 'produccion' ? 'Webpay Plus producción' : 'Webpay Plus de pruebas'}`}>
        {!status.webpay.configured ? (
          <p className="text-red-700" role="alert">{status.webpay.error || 'Falta configurar el método de pago en el servidor.'}</p>
        ) : status.webpay.mode === 'boton' ? (
          <p className="text-neutral-600">El cliente paga en Webpay.cl. Este botón no informa el pago automáticamente a la tienda. Verifica el importe y el pedido en Webpay y usa <strong>Pedidos → Por confirmar pago → Confirmar pago recibido</strong>. Esa confirmación descuenta el stock una sola vez.</p>
        ) : status.webpay.mode === 'produccion' ? (
          <p className="text-neutral-600">El pago se confirma mediante Webpay Plus y el servidor descuenta el stock al recibir la autorización.</p>
        ) : (
          <p className="text-neutral-600">Este modo usa pagos de prueba. No realiza cobros reales.</p>
        )}
      </Row>

      <Row ok={status.email.configured} title="Notificación de compras por correo">
        {status.email.configured ? (
          <p className="text-neutral-600">Al confirmar un pago se intenta enviar el aviso a <strong>{status.email.notifyTo}</strong> y la confirmación al cliente. El estado del envío aparece en cada pedido.</p>
        ) : (
          <p className="text-neutral-600">Falta configurar el envío. Define <span className={code}>SMTP_USER</span> y <span className={code}>SMTP_PASS</span> en el servidor, y <span className={code}>SMTP_HOST</span> si tu proveedor lo requiere. Para Gmail usa una contraseña de aplicación.</p>
        )}
        <button
          disabled={!status.email.configured || sending}
          onClick={async () => {
            setSending(true);
            try {
              await adminFetch('/api/admin/test-email', { method: 'POST' });
              alert(`Correo de prueba enviado a ${status.email.notifyTo}.`);
            } catch (e: any) {
              alert(`Error: ${e.message}`);
            } finally { setSending(false); }
          }}
          className="mt-2 h-9 px-4 rounded-full bg-neutral-900 text-white text-xs font-semibold inline-flex items-center gap-2 disabled:opacity-40"
        >
          <Mail className="w-4 h-4" /> {sending ? 'Enviando…' : 'Enviar correo de prueba'}
        </button>
      </Row>
    </div>
  );
}
