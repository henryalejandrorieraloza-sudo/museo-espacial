import './styles.css';
import { createBaseScene } from './scenes/baseScene';
import { requireEl } from './ui/dom';

const scene = createBaseScene(requireEl('scene'));
scene.start();
