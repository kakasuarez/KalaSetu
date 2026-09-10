/**
 * The app's icon vocabulary, in one place.
 *
 * Icons are literal, not abstract: a rupee note rather than a chart, a house
 * rather than a dashboard glyph. Someone who cannot read the label has to
 * recognise the picture, so anything that needs interpretation is the wrong
 * icon.
 *
 * Going through a name map rather than importing lucide directly at each call
 * site keeps sizes consistent (28 in the tab bar, 24 inline) and means a
 * swapped icon changes one line, not twenty.
 */
import React from 'react';
import {
  AlertTriangle,
  Award,
  Camera,
  Check,
  ChevronLeft,
  ChevronRight,
  GraduationCap,
  Image as ImageIcon,
  MessageCircle,
  Mic,
  Package,
  Pencil,
  Plus,
  RotateCcw,
  Sparkles,
  Square,
  Store,
  Home as HomeIcon,
  User,
  Video,
  Volume2,
  X,
} from 'lucide-react-native';

import { colors } from '../../theme';

export const icons = {
  home: HomeIcon,
  shop: Store,
  inbox: MessageCircle,
  learn: GraduationCap,
  speaker: Volume2,
  mic: Mic,
  stop: Square,
  plus: Plus,
  camera: Camera,
  video: Video,
  gallery: ImageIcon,
  package: Package,
  user: User,
  back: ChevronLeft,
  forward: ChevronRight,
  check: Check,
  close: X,
  warning: AlertTriangle,
  sparkle: Sparkles,
  award: Award,
  edit: Pencil,
  undo: RotateCcw,
} as const;

export type IconName = keyof typeof icons;

type Props = {
  name: IconName;
  size?: number;
  color?: string;
  strokeWidth?: number;
};

export function Icon({ name, size = 24, color = colors.text, strokeWidth = 2 }: Props) {
  const Glyph = icons[name];
  return <Glyph size={size} color={color} strokeWidth={strokeWidth} />;
}
