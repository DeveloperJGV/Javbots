import type { ReactNode } from 'react';

import type { OfertasInstallments, OfertasVerdict } from '../../../core/src/messages.js';
import type { MessageTransport } from '../../../core/src/transport.js';
import { MSI_TITLE } from './constants.js';
import { keepaUrl, msiText, sellerTag, verdictTag } from './ofertasText.js';

export type Send = (msg: Parameters<MessageTransport['send']>[0]) => void;

export const inputClass =
  'py-2 px-4 bg-bg-dark border-2 border-border rounded-none text-text placeholder:text-text-muted focus:border-accent outline-none';
export const sectionTitle = 'text-lg text-accent-bright';
export const cardClass = 'border-2 border-border bg-bg-dark p-8 flex flex-col gap-4';
export const linkClass = 'text-accent-bright underline hover:text-text';

/** A store's page, always in a new tab. */
export function StoreLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <a className={linkClass} href={href} target="_blank" rel="noreferrer">
      {children}
    </a>
  );
}

/** A small pixel label ("Lo vende la tienda", "Envío gratis", "frágil"). */
export function Tag({
  children,
  tone = 'muted',
  title,
}: {
  children: ReactNode;
  tone?: 'ok' | 'muted' | 'bad' | 'warn' | 'accent';
  title?: string;
}) {
  const color =
    tone === 'ok'
      ? 'border-status-success text-status-success'
      : tone === 'bad'
        ? 'border-status-error text-status-error'
        : tone === 'warn'
          ? 'border-status-permission text-status-permission'
          : tone === 'accent'
            ? 'border-accent-bright bg-active-bg text-text'
            : 'border-border text-text-muted';
  return (
    <span className={`border-2 px-4 text-xs whitespace-nowrap ${color}`} title={title}>
      {children}
    </span>
  );
}

/** "Buen precio", "Precio normal", "Caro" or "Todavía no sé", and the line that says why. */
export function VerdictLine({ verdict }: { verdict?: OfertasVerdict }) {
  if (!verdict) return null;
  const tag = verdictTag(verdict.kind);
  return (
    <span className="flex flex-wrap items-baseline gap-4">
      <Tag tone={tag.tone}>{tag.text}</Tag>
      <span className="text-xs">{verdict.reason}</span>
    </span>
  );
}

/** "Lo vende la tienda" or "Revendedor", with what it means on hover. */
export function SellerTag({ offer }: { offer: { official: boolean; sellerUnknown?: boolean } }) {
  const tag = sellerTag(offer);
  return (
    <Tag tone={offer.official ? 'ok' : 'muted'} title={tag.title}>
      {tag.text}
    </Tag>
  );
}

/** "MSI: hasta 12 meses · ver condiciones", only when the store said so. */
export function MsiTag({ installments, url }: { installments?: OfertasInstallments; url: string }) {
  if (!installments) return null;
  return (
    <span className="text-xs" title={MSI_TITLE}>
      <Tag>{msiText(installments)}</Tag> <StoreLink href={url}>ver condiciones</StoreLink>
    </span>
  );
}

/** "Ver historial en Keepa" for an Amazon product (just the link). */
export function KeepaLink({ offer }: { offer: { sourceId: string; url: string } }) {
  const url = keepaUrl(offer);
  if (!url) return null;
  return (
    <span className="text-xs">
      <StoreLink href={url}>Ver historial en Keepa</StoreLink>
    </span>
  );
}
