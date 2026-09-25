'use client';

import { AlertTriangle, CheckCircle2, MinusCircle, ShieldAlert, ShieldCheck, XCircle } from 'lucide-react';

/**
 * El estado hábil de la empresa, sobre el detalle de una licitación.
 *
 * Es lo primero que hay que saber antes de postular: inhábil significa rechazo
 * por forma, sin importar la oferta.
 */

export default function EstadoHabilBadge({ estado }: { estado?: string }) {
  if (!estado || estado === 'desconocido') return null;

  const cfg: Record<string, { icon: JSX.Element; cls: string; label: string }> = {
    habil: {
      icon: <ShieldCheck className="h-4 w-4" />,
      cls: 'bg-accent/10 text-accent border-accent/30',
      label: 'Tu empresa está hábil',
    },
    inhabil: {
      icon: <ShieldAlert className="h-4 w-4" />,
      cls: 'bg-danger/10 text-danger border-danger/30',
      label: 'Tu empresa no está hábil',
    },
    // «RUT no encontrado en registro» describe lo que le pasó a nuestra
    // consulta, no lo que le pasa al usuario. Lo que le pasa es que no puede
    // ofertar: o el RUT está mal escrito, o la empresa no está inscrita.
    // Lo único que confirma la API pública. No se dice «hábil»: eso lo ve
    // sólo el proveedor en su ficha, y afirmarlo sería inventarlo.
    inscrito: {
      icon: <ShieldCheck className="h-4 w-4" />,
      cls: 'bg-accent/10 text-accent border-accent/30',
      label: 'Tu empresa está inscrita en Mercado Público',
    },
    no_encontrado: {
      icon: <AlertTriangle className="h-4 w-4" />,
      cls: 'bg-gold/10 text-gold border-gold/30',
      label: 'Tu RUT no figura en el Registro de Proveedores',
    },
  };

  const c = cfg[estado];
  if (!c) return null;

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium ${c.cls}`}
    >
      {c.icon}
      {c.label}
    </span>
  );
}

// ¿Tu perfil encaja? widget
const nivelConfig: Record<string, { icon: JSX.Element; color: string; label: string; description: string }> = {
  alto: {
    icon: <CheckCircle2 className="h-5 w-5 text-accent" />,
    color: 'bg-accent/10 border-accent/30 text-accent',
    label: 'Encaje alto',
    description: 'Tu empresa tiene experiencia directa en este tipo de producto o servicio.',
  },
  medio: {
    icon: <CheckCircle2 className="h-5 w-5 text-gold" />,
    color: 'bg-gold/10 border-gold/30 text-gold',
    label: 'Encaje moderado',
    description: 'Hay similitud parcial entre tu perfil y esta licitación.',
  },
  bajo: {
    icon: <MinusCircle className="h-5 w-5 text-muted" />,
    color: 'bg-border border-borderLight text-muted',
    label: 'Encaje bajo',
    description: 'Hay poca coincidencia entre tu perfil y esta licitación.',
  },
  sin_encaje: {
    icon: <XCircle className="h-5 w-5 text-danger" />,
    color: 'bg-danger/10 border-danger/30 text-danger',
    label: 'Sin encaje detectado',
    description: 'No se detectó coincidencia semántica entre tu perfil y esta licitación.',
  },
};
