/**
 * Convertit une valeur (string, Timestamp, etc.) en date affichée (format FR)
 */
export function toDateString(val: unknown): string {
  if (!val) return '';
  
  if (typeof val === 'string') {
    const m = val.match(/^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})/);
    if (m) return `${m[3]}/${m[2]}/${m[1]} ${m[4]}:${m[5]}`;
    return val;
  }
  
  if (typeof val === 'object' && val !== null && 'seconds' in val) {
    const d = new Date((val as { seconds: number }).seconds * 1000);
    return d.toLocaleString('fr-FR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  }
  
  return String(val);
}

/**
 * Convertit une valeur en millisecondes (epoch time)
 */
export function toEpochMillis(val: unknown): number | undefined {
  if (!val) return undefined;
  
  if (typeof val === 'string') {
    const dt = new Date(val);
    const t = dt.getTime();
    return Number.isNaN(t) ? undefined : t;
  }
  
  if (typeof val === 'object' && val !== null && 'seconds' in val) {
    return (val as { seconds: number }).seconds * 1000;
  }
  
  return undefined;
}

/**
 * Convertit une valeur en format input datetime-local (YYYY-MM-DDTHH:mm)
 */
export function toInputLocalString(val: unknown): string {
  if (!val) return '';
  
  if (typeof val === 'string') {
    if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(val)) return val;
    
    const d = new Date(val);
    if (!Number.isNaN(d.getTime())) {
      return formatDateForInput(d);
    }
    return '';
  }
  
  if (typeof val === 'object' && val !== null && 'seconds' in val) {
    const d = new Date((val as { seconds: number }).seconds * 1000);
    return formatDateForInput(d);
  }
  
  return '';
}

/**
 * Formate une Date en string pour input datetime-local
 */
function formatDateForInput(d: Date): string {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  const hh = String(d.getHours()).padStart(2, '0');
  const mi = String(d.getMinutes()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}T${hh}:${mi}`;
}
