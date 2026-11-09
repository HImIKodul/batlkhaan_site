import React, {
  createContext,
  forwardRef,
  useContext,
  useEffect,
  useId,
  useRef,
  useState,
} from 'react';
import { createPortal } from 'react-dom';

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';
type ButtonSize = 'compact' | 'default' | 'touch';

type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  fullWidth?: boolean;
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  {
    children,
    variant = 'primary',
    size = 'default',
    loading = false,
    fullWidth = false,
    disabled = false,
    className = '',
    type = 'button',
    ...props
  },
  ref,
) {
  const blocked = disabled || loading;
  return (
    <button
      ref={ref}
      type={type}
      disabled={blocked}
      aria-busy={loading || undefined}
      className={`mmri-button btn btn-${variant} mmri-button--${variant} mmri-button--${size}${fullWidth ? ' mmri-button--full' : ''} ${className}`.trim()}
      {...props}
    >
      {loading && <span className="mmri-button__spinner" aria-hidden="true" />}
      <span className="mmri-button__label">{children}</span>
    </button>
  );
});

type IconButtonProps = Omit<ButtonProps, 'children'> & {
  label: string;
  children: React.ReactNode;
};

export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(function IconButton(
  { label, className = '', children, variant = 'ghost', ...props },
  ref,
) {
  return (
    <Button
      ref={ref}
      variant={variant}
      aria-label={label}
      title={label}
      className={`mmri-icon-button ${className}`.trim()}
      {...props}
    >
      {children}
    </Button>
  );
});

type CardProps = React.HTMLAttributes<HTMLElement> & {
  tone?: 'default' | 'subtle' | 'focal';
};

export function Card({ children, className = '', tone = 'default', ...props }: CardProps) {
  return (
    <section className={`mmri-surface card mmri-surface--${tone} ${className}`.trim()} {...props}>
      {children}
    </section>
  );
}

export function Pill({ children, active = false, muted = false }: {children: React.ReactNode; active?: boolean; muted?: boolean}) {
  return <span className={`mmri-tag pill${active ? ' is-active' : ''}${muted ? ' is-muted' : ''}`}>{children}</span>;
}

type BadgeTone = 'success' | 'warning' | 'danger' | 'neutral' | 'info';
export function StatusBadge({ children, tone = 'neutral' }: {children: React.ReactNode; tone?: BadgeTone}) {
  return <span className={`mmri-badge mmri-badge--${tone} status status-${tone}`}>{children}</span>;
}

export function ProgressBar({ value, label }: {value: number; label?: string}) {
  const safe = Math.max(0, Math.min(100, value));
  const rounded = Math.round(safe);
  return (
    <div
      className="mmri-progress progress-wrap"
      role="progressbar"
      aria-label={label || `Явц ${rounded} хувь`}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={rounded}
    >
      <div className="mmri-progress__track progress-track">
        <span className="mmri-progress__fill progress-fill" style={{ width: `${safe}%` }} />
      </div>
    </div>
  );
}

export function SectionHeader({ eyebrow, title, description, action }: {eyebrow?: string; title: string; description?: string; action?: React.ReactNode}) {
  return (
    <div className="section-head page-heading">
      <div>
        {eyebrow && <div className="eyebrow">{eyebrow}</div>}
        <h1 tabIndex={-1} data-route-heading>{title}</h1>
        {description && <p className="muted section-desc">{description}</p>}
      </div>
      {action && <div className="section-action">{action}</div>}
    </div>
  );
}

export function SaveStatus({ state = 'saved' }: {state?: 'saving' | 'saved' | 'error'}) {
  const text = state === 'saving' ? 'Хадгалж байна' : state === 'error' ? 'Хадгалахад алдаа гарлаа' : 'Хадгалагдсан';
  return (
    <span className={`mmri-save-status mmri-save-status--${state}`} role="status" aria-live="polite">
      <span className="mmri-save-status__mark" aria-hidden="true">{state === 'saving' ? '' : state === 'error' ? '!' : '✓'}</span>
      {text}
    </span>
  );
}

type FieldProps = {
  label: React.ReactNode;
  htmlFor?: string;
  help?: React.ReactNode;
  error?: React.ReactNode;
  required?: boolean;
  className?: string;
  children: React.ReactNode;
};

export function Field({ label, htmlFor, help, error, required = false, className = '', children }: FieldProps) {
  const messageId = useId();
  const child = React.isValidElement<Record<string, unknown>>(children)
    ? React.cloneElement(children, {
        ...(error || help ? { 'aria-describedby': [children.props['aria-describedby'], messageId].filter(Boolean).join(' ') } : {}),
        ...(error ? { 'aria-invalid': true } : {}),
        ...(required ? { 'aria-required': true } : {}),
      })
    : children;
  return (
    <label className={`mmri-field ${error ? 'mmri-field--error' : ''} ${className}`.trim()} htmlFor={htmlFor}>
      <span className="mmri-field__label">
        {label}
        {required && <span className="mmri-field__required" aria-hidden="true">*</span>}
      </span>
      {child}
      {error ? <span id={messageId} className="mmri-field__message mmri-field__message--error" role="alert">{error}</span> : help ? <span id={messageId} className="mmri-field__message">{help}</span> : null}
    </label>
  );
}

type InputProps = React.InputHTMLAttributes<HTMLInputElement> & {
  invalid?: boolean;
};
export const Input = forwardRef<HTMLInputElement, InputProps>(function Input({ className = '', invalid = false, ...props }, ref) {
  return <input ref={ref} aria-invalid={invalid || undefined} className={`mmri-input ${className}`.trim()} {...props} />;
});

type TextareaProps = React.TextareaHTMLAttributes<HTMLTextAreaElement> & {
  invalid?: boolean;
};
export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(function Textarea({ className = '', invalid = false, ...props }, ref) {
  return <textarea ref={ref} aria-invalid={invalid || undefined} className={`mmri-textarea ${className}`.trim()} {...props} />;
});

type SelectProps = React.SelectHTMLAttributes<HTMLSelectElement> & {
  invalid?: boolean;
};
export const Select = forwardRef<HTMLSelectElement, SelectProps>(function Select({ className = '', invalid = false, children, ...props }, ref) {
  return <select ref={ref} aria-invalid={invalid || undefined} className={`mmri-select ${className}`.trim()} {...props}>{children}</select>;
});


type ChoiceSelectOption={value:string|number;label:string};
type ChoiceSelectProps={value:string|number|null;options:ChoiceSelectOption[];onValueChange:(value:string|number)=>void;label:string;className?:string;disabled?:boolean};
export function ChoiceSelect({value,options,onValueChange,label,className='',disabled=false}:ChoiceSelectProps){
 const [open,setOpen]=useState(false);const [place,setPlace]=useState<{up:boolean;max:number}>({up:false,max:280});const root=useRef<HTMLDivElement|null>(null);const triggerRef=useRef<HTMLButtonElement|null>(null);const refs=useRef<Array<HTMLButtonElement|null>>([]);const menuId=useId();const selectedIndex=Math.max(0,options.findIndex(o=>String(o.value)===String(value)));const selected=options.find(o=>String(o.value)===String(value))??options[0];
 useEffect(()=>{if(!open)return;const close=(e:MouseEvent)=>{if(root.current&&!root.current.contains(e.target as Node))setOpen(false)};const closeOnEscape=(e:KeyboardEvent)=>{if(e.key==='Escape'){e.preventDefault();setOpen(false);triggerRef.current?.focus()}};document.addEventListener('mousedown',close);document.addEventListener('keydown',closeOnEscape);return()=>{document.removeEventListener('mousedown',close);document.removeEventListener('keydown',closeOnEscape)}},[open]);
 const focusAt=(i:number)=>{if(!options.length)return;const next=(i+options.length)%options.length;refs.current[next]?.focus()};
 /** Open towards the roomier side; fixed bottom bars (mobile nav, sticky save bar) count as the floor so options are never hidden behind them. */
 const placeMenu=()=>{const t=triggerRef.current;if(!t)return;const want=Math.min(280,options.length*46+12);const measure=()=>{const r=t.getBoundingClientRect();const bars=['.mmri-bottom-nav','.company-detail-editor__bar'].map(q=>document.querySelector(q)).filter((e):e is Element=>!!e).map(e=>e.getBoundingClientRect().top).filter(top=>top>r.top);const floor=Math.min(window.innerHeight,...bars)-12;return {below:floor-r.bottom-6,above:r.top-18}};let m=measure();if(m.below<want&&m.above<want){t.scrollIntoView({block:'center'});m=measure()}const up=m.below<want&&m.above>m.below;setPlace({up,max:Math.max(120,Math.min(280,Math.floor(up?m.above:m.below)))})};
 const openAndFocus=(index:number)=>{placeMenu();setOpen(true);requestAnimationFrame(()=>focusAt(index))};
 const onTriggerKey=(e:React.KeyboardEvent<HTMLButtonElement>)=>{if(['ArrowDown','ArrowUp','Enter',' '].includes(e.key)){e.preventDefault();openAndFocus(e.key==='ArrowUp'?selectedIndex-1:selectedIndex)}};
 return <div ref={root} className={`mmri-choice-select ${open?'is-open':''} ${className}`.trim()}>
  <button ref={triggerRef} type="button" className="mmri-choice-select__trigger" aria-expanded={open} aria-haspopup="listbox" aria-controls={open?menuId:undefined} aria-label={label} disabled={disabled} onClick={()=>{if(open)setOpen(false);else openAndFocus(selectedIndex)}} onKeyDown={onTriggerKey}><span>{selected?.label||'Сонгох'}</span><span className="mmri-choice-select__chevron" aria-hidden="true">⌄</span></button>
  {open&&<div id={menuId} className={`mmri-choice-select__menu${place.up?' is-up':''}`} style={{maxHeight:place.max}} role="listbox" aria-label={label}>{options.map((o,i)=>{const active=String(o.value)===String(value);return <button ref={el=>{refs.current[i]=el}} type="button" role="option" aria-selected={active} className={active?'is-selected':''} key={String(o.value)} onClick={()=>{onValueChange(o.value);setOpen(false);requestAnimationFrame(()=>triggerRef.current?.focus())}} onKeyDown={e=>{if(e.key==='ArrowDown'){e.preventDefault();focusAt(i+1)}else if(e.key==='ArrowUp'){e.preventDefault();focusAt(i-1)}else if(e.key==='Home'){e.preventDefault();focusAt(0)}else if(e.key==='End'){e.preventDefault();focusAt(options.length-1)}else if(e.key==='Escape'){e.preventDefault();setOpen(false);triggerRef.current?.focus()}else if(e.key==='Tab'){setOpen(false)}}}><span>{o.label}</span>{active&&<b aria-hidden="true">✓</b>}</button>})}</div>}
 </div>;
}

type CheckboxProps = Omit<React.InputHTMLAttributes<HTMLInputElement>, 'type'> & {
  label: React.ReactNode;
  description?: React.ReactNode;
};
export function Checkbox({ label, description, className = '', ...props }: CheckboxProps) {
  return (
    <label className={`mmri-checkbox ${className}`.trim()}>
      <input type="checkbox" {...props} />
      <span className="mmri-checkbox__control" aria-hidden="true">✓</span>
      <span className="mmri-checkbox__copy"><span>{label}</span>{description && <small>{description}</small>}</span>
    </label>
  );
}

type RadioOption = {
  value: string | number;
  label: React.ReactNode;
  description?: React.ReactNode;
  disabled?: boolean;
  prefix?: React.ReactNode;
  className?: string;
  style?: React.CSSProperties;
};

type RadioGroupProps = {
  name: string;
  value: string | number | null;
  onValueChange: (value: string | number) => void;
  onDeselect?: () => void;
  options: RadioOption[];
  label: string;
  className?: string;
  orientation?: 'vertical' | 'grid';
};

export function RadioGroup({ name, value, onValueChange, onDeselect, options, label, className = '', orientation = 'vertical' }: RadioGroupProps) {
  return (
    <fieldset className={`mmri-radio-group mmri-radio-group--${orientation} ${className}`.trim()}>
      <legend className="mmri-visually-hidden">{label}</legend>
      {options.map((option) => {
        const checked = String(value) === String(option.value);
        return (
          <label key={String(option.value)} className={`mmri-radio-card${checked ? ' is-selected' : ''}${option.disabled ? ' is-disabled' : ''}${option.className ? ` ${option.className}` : ''}`} style={option.style} onClick={(event)=>{if(checked&&onDeselect&&!option.disabled){event.preventDefault();onDeselect()}}}>
            <input
              type="radio"
              name={name}
              value={String(option.value)}
              checked={checked}
              disabled={option.disabled}
              onChange={() => onValueChange(option.value)}
            />
            {option.prefix != null && <span className="mmri-radio-card__prefix" aria-hidden="true">{option.prefix}</span>}
            <span className="mmri-radio-card__copy"><strong>{option.label}</strong>{option.description && <small>{option.description}</small>}</span>
            <span className="mmri-radio-card__mark" aria-hidden="true" />
            {checked&&!option.disabled&&<span className="mmri-shell-glint mmri-radio-card__glint" aria-hidden="true"><i/></span>}
          </label>
        );
      })}
    </fieldset>
  );
}

type TabItem = { value: string; label: React.ReactNode; disabled?: boolean };
type TabsProps = {
  value: string;
  onValueChange: (value: string) => void;
  items: TabItem[];
  label: string;
  className?: string;
  panelId?: string;
};

export function Tabs({ value, onValueChange, items, label, className = '', panelId }: TabsProps) {
  const id = useId();
  const refs = useRef<Array<HTMLButtonElement | null>>([]);
  const move = (current: number, direction: 1 | -1) => {
    let next = current;
    for (let i = 0; i < items.length; i += 1) {
      next = (next + direction + items.length) % items.length;
      if (!items[next]?.disabled) {
        refs.current[next]?.focus();
        onValueChange(items[next].value);
        break;
      }
    }
  };
  return (
    <div className={`mmri-tabs ${className}`.trim()} role="tablist" aria-label={label} aria-orientation="horizontal">
      {items.map((item, index) => {
        const selected = item.value === value;
        return (
          <button
            key={item.value}
            ref={(node) => { refs.current[index] = node; }}
            type="button"
            role="tab"
            id={panelId ? `${panelId}-tab-${item.value}` : `${id}-tab-${index}`}
            aria-selected={selected}
            aria-controls={panelId}
            tabIndex={selected ? 0 : -1}
            disabled={item.disabled}
            className={selected ? 'is-active' : ''}
            onClick={() => onValueChange(item.value)}
            onKeyDown={(event) => {
              if (event.key === 'ArrowRight') { event.preventDefault(); move(index, 1); }
              else if (event.key === 'ArrowLeft') { event.preventDefault(); move(index, -1); }
              else if (event.key === 'Home') {
                event.preventDefault();
                const first = items.findIndex((x) => !x.disabled);
                if (first >= 0) { refs.current[first]?.focus(); onValueChange(items[first].value); }
              } else if (event.key === 'End') {
                event.preventDefault();
                let last = items.length - 1;
                while (last >= 0 && items[last]?.disabled) last -= 1;
                if (last >= 0) { refs.current[last]?.focus(); onValueChange(items[last].value); }
              }
            }}
          >
            {item.label}
          </button>
        );
      })}
    </div>
  );
}

type MenuItem = {
  id: string;
  label: React.ReactNode;
  onSelect: () => void;
  disabled?: boolean;
  danger?: boolean;
};

type MenuProps = {
  trigger: React.ReactNode;
  label: string;
  items: MenuItem[];
  align?: 'start' | 'end';
  className?: string;
};

export function Menu({ trigger, label, items, align = 'end', className = '' }: MenuProps) {
  const [open, setOpen] = useState(false);
  const menuId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const itemRefs = useRef<Array<HTMLButtonElement | null>>([]);
  useEffect(() => {
    if (!open) return;
    const onPointer = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onPointer);
    return () => document.removeEventListener('mousedown', onPointer);
  }, [open]);
  const focusAt = (index: number, direction: 1 | -1 = 1) => {
    let cursor = index;
    for (let i = 0; i < items.length; i += 1) {
      const item = items[cursor];
      if (item && !item.disabled) { itemRefs.current[cursor]?.focus(); return; }
      cursor = (cursor + direction + items.length) % items.length;
    }
  };
  return (
    <div ref={rootRef} className={`mmri-menu ${className}`.trim()}>
      <button
        ref={triggerRef}
        type="button"
        className="mmri-menu__trigger"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={menuId}
        aria-label={label}
        onClick={() => setOpen((current) => !current)}
        onKeyDown={(event) => {
          if (event.key === 'ArrowDown') { event.preventDefault(); setOpen(true); window.setTimeout(() => focusAt(0), 0); }
          else if (event.key === 'ArrowUp') { event.preventDefault(); setOpen(true); window.setTimeout(() => focusAt(items.length - 1, -1), 0); }
          else if (event.key === 'Escape' && open) { event.preventDefault(); setOpen(false); }
        }}
      >{trigger}</button>
      {open && (
        <div id={menuId} className={`mmri-menu__content mmri-menu__content--${align}`} role="menu" aria-label={label}>
          {items.map((item, index) => (
            <button
              key={item.id}
              ref={(node) => { itemRefs.current[index] = node; }}
              type="button"
              role="menuitem"
              disabled={item.disabled}
              className={item.danger ? 'is-danger' : ''}
              onClick={() => { item.onSelect(); setOpen(false); triggerRef.current?.focus(); }}
              onKeyDown={(event) => {
                if (event.key === 'ArrowDown') { event.preventDefault(); focusAt((index + 1) % items.length, 1); }
                else if (event.key === 'ArrowUp') { event.preventDefault(); focusAt((index - 1 + items.length) % items.length, -1); }
                else if (event.key === 'Home') { event.preventDefault(); focusAt(0, 1); }
                else if (event.key === 'End') { event.preventDefault(); focusAt(items.length - 1, -1); }
                else if (event.key === 'Escape') { event.preventDefault(); setOpen(false); triggerRef.current?.focus(); }
              }}
            >{item.label}</button>
          ))}
        </div>
      )}
    </div>
  );
}

type PopoverContextValue = { close: () => void };
const PopoverContext = createContext<PopoverContextValue>({ close: () => undefined });
export function usePopover() { return useContext(PopoverContext); }

type PopoverProps = {
  trigger: React.ReactNode;
  label: string;
  children: React.ReactNode;
  align?: 'start' | 'end';
  className?: string;
};

export function Popover({ trigger, label, children, align = 'start', className = '' }: PopoverProps) {
  const [open, setOpen] = useState(false);
  const contentId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!open) return;
    const closeOutside = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const closeEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { setOpen(false); triggerRef.current?.focus(); }
    };
    document.addEventListener('mousedown', closeOutside);
    document.addEventListener('keydown', closeEscape);
    return () => { document.removeEventListener('mousedown', closeOutside); document.removeEventListener('keydown', closeEscape); };
  }, [open]);
  return (
    <div ref={rootRef} className={`mmri-popover ${className}`.trim()}>
      <button ref={triggerRef} type="button" className="mmri-popover__trigger" aria-expanded={open} aria-controls={contentId} aria-haspopup="dialog" onClick={() => setOpen((x) => !x)}>{trigger}</button>
      {open && <div id={contentId} role="dialog" aria-label={label} className={`mmri-popover__content mmri-popover__content--${align}`}><PopoverContext.Provider value={{ close: () => { setOpen(false); window.setTimeout(() => triggerRef.current?.focus(), 0); } }}>{children}</PopoverContext.Provider></div>}
    </div>
  );
}

type DialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: React.ReactNode;
  children: React.ReactNode;
  footer?: React.ReactNode;
  className?: string;
  style?: React.CSSProperties;
};

export function Dialog({ open, onOpenChange, title, description, children, footer, className = '', style }: DialogProps) {
  const titleId = useId();
  const descId = useId();
  const panelRef = useRef<HTMLDivElement>(null);
  const titleRef = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    if (!open) return;
    const previous = document.activeElement as HTMLElement | null;
    const panel = panelRef.current;
    const focusables = () => Array.from(panel?.querySelectorAll<HTMLElement>('button:not([disabled]),a[href],input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])') ?? []);
    window.setTimeout(() => { titleRef.current?.focus(); }, 0);
    const keydown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { event.preventDefault(); onOpenChange(false); }
      if (event.key === 'Tab') {
        const list = focusables();
        if (!list.length) return;
        const first = list[0];
        const last = list[list.length - 1];
        if (document.activeElement === titleRef.current) { event.preventDefault(); (event.shiftKey ? last : first).focus(); }
        else if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
      }
    };
    document.addEventListener('keydown', keydown);
    return () => { document.removeEventListener('keydown', keydown); previous?.focus(); };
  }, [open, onOpenChange]);
  if (!open || typeof document === 'undefined') return null;
  return createPortal(
    <div className={`mmri-dialog-layer ${className}`.trim()} style={style} role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onOpenChange(false); }}>
      <div ref={panelRef} className="mmri-dialog" role="dialog" tabIndex={-1} aria-modal="true" aria-labelledby={titleId} aria-describedby={description ? descId : undefined}>
        <header className="mmri-dialog__header"><div><h2 ref={titleRef} tabIndex={-1} id={titleId}>{title}</h2>{description && <p id={descId}>{description}</p>}</div><IconButton label="Хаах" onClick={() => onOpenChange(false)}>×</IconButton></header>
        <div className="mmri-dialog__body">{children}</div>
        {footer && <footer className="mmri-dialog__footer">{footer}</footer>}
      </div>
    </div>,
    document.body,
  );
}

type TooltipProps = { content: React.ReactNode; children: React.ReactElement; className?: string };
export function Tooltip({ content, children, className = '' }: TooltipProps) {
  const id = useId();
  const describedChild = React.cloneElement(children as React.ReactElement<Record<string, unknown>>, { 'aria-describedby': id });
  return <span className={`mmri-tooltip ${className}`.trim()}>{describedChild}<span id={id} role="tooltip" className="mmri-tooltip__content">{content}</span></span>;
}

type TableProps = React.TableHTMLAttributes<HTMLTableElement> & { caption?: React.ReactNode };
export function Table({ caption, className = '', children, ...props }: TableProps) {
  return <div className="mmri-table-wrap"><table className={`mmri-table ${className}`.trim()} {...props}>{caption && <caption>{caption}</caption>}{children}</table></div>;
}
