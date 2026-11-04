import './styles.css';
import './juego.css';
import { iniciarJuego } from './game/juego';
import { requireEl } from './ui/dom';

void iniciarJuego(requireEl('scene'));
