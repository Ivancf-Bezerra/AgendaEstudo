export interface EventModel {
  id: string;
  title: string;
  /** Linha curta abaixo do título (opcional). */
  subtitle?: string;
  description?: string;
  /** Etiquetas (opcional); no máximo 5 na UI. */
  tags?: string[];
  /** Uma das chaves em `EVENT_COLOR_PRESETS`. */
  colorKey?: string;
  /** ISO 8601 — início do evento (persistido no `localStorage`). */
  startDate: string;
  /** ISO 8601 — fim do evento (obrigatório na UI atual). */
  endDate?: string;
  /** Concluído (persistido localmente). */
  completed?: boolean;
}

export type CreateEventInput = Omit<EventModel, 'id'>;
