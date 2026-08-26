import type { ReactNode } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import styles from './imageHero.module.css';

export interface ImageHeroAction {
  label: string;
  href: string;
  variant?: 'primary' | 'secondary';
}

export interface ImageHeroProps {
  image: string;
  eyebrow?: string;
  title: string;
  description: string;
  actions?: ImageHeroAction[];
  imagePosition?: string;
  imageSize?: string;
  theme?: 'orange' | 'blue' | 'green' | 'violet' | 'teal' | 'rose';
  variant?: 'home' | 'compact';
  priority?: boolean;
  children?: ReactNode;
}

export default function ImageHero({
  image,
  eyebrow,
  title,
  description,
  actions = [],
  imagePosition = 'center',
  imageSize = 'cover',
  theme = 'orange',
  variant = 'compact',
  priority = true,
  children,
}: ImageHeroProps) {
  const objectFit = imageSize === 'contain' ? 'contain' : 'cover';

  return (
    <section className={`${styles.hero} ${styles[theme]} ${variant === 'home' ? styles.homeHero : styles.compactHero}`}>
      <div className={styles.photo} aria-hidden="true">
        <Image
          src={image}
          alt=""
          fill
          priority={priority}
          fetchPriority={priority ? 'high' : 'auto'}
          quality={88}
          sizes="100vw"
          style={{ objectFit, objectPosition: imagePosition }}
        />
      </div>
      <div className={styles.wash} aria-hidden="true" />
      <div className={styles.content}>
        {eyebrow && <div className={styles.eyebrow}>{eyebrow}</div>}
        <h1>{title}</h1>
        <p>{description}</p>
        {actions.length > 0 && (
          <div className={styles.actions}>
            {actions.map((action) => (
              <Link
                key={`${action.href}-${action.label}`}
                href={action.href}
                className={action.variant === 'secondary' ? styles.secondary : styles.primary}
              >
                {action.label} <span aria-hidden="true">→</span>
              </Link>
            ))}
          </div>
        )}
        {children}
      </div>
    </section>
  );
}
