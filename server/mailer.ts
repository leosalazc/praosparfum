import nodemailer from 'nodemailer';
import { ADMIN_EMAIL, Order, formatCLP } from '../src/lib/catalog.js';

export const NOTIFY_EMAIL = process.env.NOTIFY_EMAIL || ADMIN_EMAIL;
const STORE_NAME = 'Práos Parfum';

export const smtpConfigured = () => !!(process.env.SMTP_USER && process.env.SMTP_PASS);

let transporter: ReturnType<typeof nodemailer.createTransport> | null = null;
function getTransporter() {
  if (!smtpConfigured()) return null;
  if (!transporter) {
    const port = Number(process.env.SMTP_PORT) || 465;
    transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST || 'smtp.gmail.com',
      port,
      secure: port === 465,
      requireTLS: port !== 465,
      connectionTimeout: 5000,
      greetingTimeout: 5000,
      socketTimeout: 10000,
      auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
    });
  }
  return transporter;
}

const esc = (s: unknown) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

function itemsTable(order: Order) {
  const rows = order.items
    .map(
      (i) => `<tr>
        <td style="padding:8px 0;border-bottom:1px solid #eee">${i.quantity} × <strong>${esc(i.name)}</strong> ${esc(i.size)}${
          i.brand && i.type !== 'AUTOR' ? `<br><span style="color:#888;font-size:12px">Inspirado en ${esc(i.brand)}</span>` : ''
        }</td>
        <td style="padding:8px 0;border-bottom:1px solid #eee;text-align:right">${formatCLP(i.unitPrice * i.quantity)}</td>
      </tr>`
    )
    .join('');
  return `<table style="width:100%;border-collapse:collapse;font-size:14px">${rows}
    <tr><td style="padding:6px 0;color:#666">Subtotal</td><td style="text-align:right">${formatCLP(order.subtotal)}</td></tr>
    <tr><td style="padding:6px 0;color:#666">Envío</td><td style="text-align:right">${order.shipping ? formatCLP(order.shipping) : 'Sin costo'}</td></tr>
    <tr><td style="padding:8px 0;font-weight:bold;font-size:16px">Total</td><td style="text-align:right;font-weight:bold;font-size:16px">${formatCLP(order.total)}</td></tr>
  </table>`;
}

function deliveryBlock(order: Order) {
  const d = order.delivery;
  if (d.method === 'pickup') return `<p><strong>Retiro en tienda</strong> — coordinar por Instagram.</p>`;
  return `<p><strong>Envío a domicilio</strong><br>${esc(d.address)}${d.comuna ? ', ' + esc(d.comuna) : ''}<br>${esc(d.region)}${
    d.notes ? `<br><em>Notas: ${esc(d.notes)}</em>` : ''
  }</p>`;
}

function wrap(body: string) {
  return `<div style="font-family:Arial,Helvetica,sans-serif;max-width:560px;margin:0 auto;color:#171717">
    <div style="background:#171717;color:#ecc255;padding:16px 24px;font-size:20px;letter-spacing:2px">PRÁOS PARFUM</div>
    <div style="padding:24px;border:1px solid #eee;border-top:0">${body}</div></div>`;
}

function ownerEmail(order: Order, pending = false) {
  const c = order.customer;
  const phone = c.phone.replace(/\D/g, '');
  return wrap(`
    <h2 style="margin:0 0 8px">🛍️ ${pending ? 'Nuevo pedido' : 'Nueva compra'}: ${formatCLP(order.total)}</h2>
    ${
      pending
        ? `<p style="background:#fff7e0;border:1px solid #ecc255;padding:12px;font-size:14px;line-height:1.5">
            <strong>Pago por confirmar.</strong> El cliente fue enviado al botón de pago de Webpay.cl por
            <strong>${formatCLP(order.total)}</strong>. Cuando llegue el correo de Transbank con ese pago
            (correo del cliente: ${esc(c.email)}), marca el pedido como <strong>Pagado</strong> en el panel de
            administración: se descuenta el stock y el cliente recibe su confirmación.<br>
            Revisa que el monto pagado coincida: en Webpay.cl el cliente puede modificarlo.</p>`
        : ''
    }
    <p style="color:#666;margin:0 0 16px">Pedido <strong>${esc(order.id)}</strong> · ${new Date(order.paidAt || order.createdAt).toLocaleString('es-CL', { timeZone: 'America/Santiago' })}</p>
    ${itemsTable(order)}
    <h3 style="margin:24px 0 8px">Cliente</h3>
    <p>${esc(c.name)}<br><a href="mailto:${esc(c.email)}">${esc(c.email)}</a><br>
      <a href="https://wa.me/${esc(phone)}">${esc(c.phone)} (WhatsApp)</a></p>
    <h3 style="margin:24px 0 8px">Entrega</h3>
    ${deliveryBlock(order)}
    ${pending ? '' : `<h3 style="margin:24px 0 8px">Pago Webpay</h3>
    <p style="font-size:13px;color:#555">Autorización: ${esc(order.payment?.authorizationCode || '-')} · Tarjeta ****${esc(
      order.payment?.cardLast4 || '----'
    )} · Tipo: ${esc(order.payment?.paymentType || '-')} · Cuotas: ${esc(order.payment?.installments ?? 0)}</p>
    <p style="font-size:13px;color:#555">${
      order.stockApplied ? 'El stock ya fue descontado por el servidor.' : 'Este pago requiere revisar el inventario en el panel de administración.'
    }</p>`}`);
}

function customerEmail(order: Order) {
  return wrap(`
    <h2 style="margin:0 0 8px">¡Gracias por tu compra, ${esc(order.customer.name.split(' ')[0])}!</h2>
    <p style="color:#666">Recibimos tu pago. Tu pedido <strong>${esc(order.id)}</strong> ${order.stockIssue ? 'requiere una revisión de disponibilidad. Te contactaremos para resolverlo.' : 'está en preparación.'}</p>
    ${itemsTable(order)}
    <h3 style="margin:24px 0 8px">Entrega</h3>
    ${deliveryBlock(order)}
    <p>Si tienes dudas escríbenos por Instagram <a href="https://instagram.com/praosparfum.cl">@praosparfum.cl</a> indicando tu número de pedido.</p>`);
}

async function send(to: string, subject: string, html: string, replyTo?: string) {
  const t = getTransporter();
  if (!t) throw new Error('SMTP no configurado');
  await t.sendMail({ from: `"${STORE_NAME}" <${process.env.SMTP_FROM || process.env.SMTP_USER}>`, to, subject, html, replyTo });
}

/** Sends the owner notification (and a confirmation to the customer). */
export async function sendOrderEmails(order: Order): Promise<'enviado' | 'error' | 'no_configurado'> {
  if (!smtpConfigured()) {
    console.warn(`[mail] SMTP no configurado — no se envió la notificación del pedido ${order.id}.`);
    return 'no_configurado';
  }
  const results = await Promise.allSettled([
    send(NOTIFY_EMAIL, `Nueva compra ${formatCLP(order.total)} · Pedido ${order.id}`, ownerEmail(order), order.customer.email),
    send(order.customer.email, `Confirmación de tu pedido ${order.id} · ${STORE_NAME}`, customerEmail(order), NOTIFY_EMAIL),
  ]);
  if (results.some((result) => result.status === 'rejected')) {
    console.error('[mail] No se pudieron enviar todas las notificaciones del pedido.');
    return 'error';
  }
  return 'enviado';
}

/** Webpay.cl button mode: notifies the owner of a new order awaiting payment confirmation. */
export async function sendPendingOrderEmail(order: Order): Promise<'enviado' | 'error' | 'no_configurado'> {
  if (!smtpConfigured()) {
    console.warn(`[mail] SMTP no configurado — no se envió el aviso del pedido ${order.id}.`);
    return 'no_configurado';
  }
  try {
    await send(NOTIFY_EMAIL, `Nuevo pedido ${formatCLP(order.total)} (pago por confirmar) · ${order.id}`, ownerEmail(order, true), order.customer.email);
    return 'enviado';
  } catch (e) {
    console.error('[mail] No se pudo enviar el aviso de pedido.');
    return 'error';
  }
}

/** Sent when the owner marks a Webpay.cl order as paid. */
export async function sendCustomerConfirmation(order: Order): Promise<'enviado' | 'error' | 'no_configurado'> {
  if (!smtpConfigured()) return 'no_configurado';
  try {
    await send(order.customer.email, `Confirmación de tu pedido ${order.id} · ${STORE_NAME}`, customerEmail(order), NOTIFY_EMAIL);
    return 'enviado';
  } catch (e) {
    console.error('[mail] No se pudo enviar la confirmación al cliente.');
    return 'error';
  }
}

export async function sendTestEmail() {
  await send(NOTIFY_EMAIL, 'Prueba de notificaciones · Práos Parfum', wrap('<p>✅ Las notificaciones de compra están funcionando.</p>'));
}
