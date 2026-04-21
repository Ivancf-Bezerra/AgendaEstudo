import { Injectable, signal } from '@angular/core';

export interface OpcoesConfirmacao {
  titulo: string;
  mensagem: string;
  textoConfirmar?: string;
  textoCancelar?: string;
  /** Destaca o botão de confirmação em vermelho (ex.: apagar). */
  variante?: 'normal' | 'perigo';
}

@Injectable({ providedIn: 'root' })
export class ConfirmDialogService {
  readonly aberto = signal(false);
  readonly titulo = signal('');
  readonly mensagem = signal('');
  readonly textoConfirmar = signal('OK');
  readonly textoCancelar = signal('Cancelar');
  readonly variantePerigo = signal(false);

  private resolver: ((valor: boolean) => void) | null = null;

  /** Abre o diálogo e devolve `true` se o utilizador confirmar. */
  pedirConfirmacao(opcoes: OpcoesConfirmacao): Promise<boolean> {
    return new Promise((resolve) => {
      if (this.resolver) {
        this.resolver(false);
      }
      this.titulo.set(opcoes.titulo);
      this.mensagem.set(opcoes.mensagem);
      this.textoConfirmar.set(opcoes.textoConfirmar ?? 'Confirmar');
      this.textoCancelar.set(opcoes.textoCancelar ?? 'Cancelar');
      this.variantePerigo.set(opcoes.variante === 'perigo');
      this.resolver = resolve;
      this.aberto.set(true);
    });
  }

  confirmar(): void {
    this.fechar(true);
  }

  cancelar(): void {
    this.fechar(false);
  }

  private fechar(resultado: boolean): void {
    this.aberto.set(false);
    const r = this.resolver;
    this.resolver = null;
    r?.(resultado);
  }
}
