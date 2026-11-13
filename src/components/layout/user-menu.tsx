'use client';

import { useEffect, useRef, useState } from 'react';
import { Dialog as DialogPrimitive } from '@base-ui/react/dialog';
import { Check, LogOut, Palette, Pipette, Settings, X } from 'lucide-react';
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { APP_SHELL_ID, BG_COOKIE, BG_PRESETS, DEFAULT_BG, isDark, normalizeBg } from '@/features/theme/background';

function applyBackground(hex: string) {
  const shell = document.getElementById(APP_SHELL_ID);
  if (shell) {
    if (hex === DEFAULT_BG) shell.style.removeProperty('--background');
    else shell.style.setProperty('--background', hex);
    shell.classList.toggle('dark', isDark(hex));
  }
  // Menus and popups open outside the shell; dark mode on <html> covers them too.
  document.documentElement.classList.toggle('dark', isDark(hex));
  document.cookie = `${BG_COOKIE}=${encodeURIComponent(hex)}; path=/; max-age=31536000; samesite=lax`;
}

/** Settings (gear) next to the user's name: Change theme and Sign out. */
export function UserMenu({ initialBg }: { initialBg: string }) {
  const [bg, setBg] = useState(normalizeBg(initialBg));
  const [customOpen, setCustomOpen] = useState(false);
  const [signOutOpen, setSignOutOpen] = useState(false);
  const signOutForm = useRef<HTMLFormElement>(null);

  // Popups render outside the app shell, so mirror dark mode on <html> while the app is open.
  useEffect(() => {
    document.documentElement.classList.toggle('dark', isDark(bg));
    return () => document.documentElement.classList.remove('dark');
  }, [bg]);

  const choose = (hex: string) => {
    const v = normalizeBg(hex);
    setBg(v);
    applyBackground(v);
  };

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger
          aria-label="Settings"
          title="Settings"
          className="grid size-8 place-items-center rounded-full text-muted-foreground transition-colors hover:bg-foreground/10 hover:text-foreground data-[popup-open]:bg-foreground/10 data-[popup-open]:text-foreground"
        >
          <Settings className="size-[18px]" />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-48">
          <DropdownMenuSub>
            <DropdownMenuSubTrigger>
              <Palette /> Change theme
            </DropdownMenuSubTrigger>
            <DropdownMenuSubContent className="w-56">
              {BG_PRESETS.map((p) => (
                <DropdownMenuItem key={p.color} onClick={() => choose(p.color)}>
                  <span className="size-4 shrink-0 rounded-full ring-1 ring-foreground/20" style={{ backgroundColor: p.color }} aria-hidden />
                  <span className="flex-1">{p.name}</span>
                  {bg === p.color && <Check className="text-foreground" aria-label="current" />}
                </DropdownMenuItem>
              ))}
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => setCustomOpen(true)}>
                <span className="size-4 shrink-0 rounded-full ring-1 ring-foreground/20" style={{ backgroundColor: bg }} aria-hidden />
                <span className="flex-1">Custom color…</span>
                {!BG_PRESETS.some((p) => p.color === bg) && <Check className="text-foreground" aria-label="current" />}
              </DropdownMenuItem>
            </DropdownMenuSubContent>
          </DropdownMenuSub>
          <DropdownMenuSeparator />
          <DropdownMenuItem variant="destructive" onClick={() => setSignOutOpen(true)}>
            <LogOut /> Sign out
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <CustomColorDialog open={customOpen} onOpenChange={setCustomOpen} current={bg} onApply={choose} />

      <form ref={signOutForm} action="/auth/signout" method="post" className="hidden" />
      <AlertDialog open={signOutOpen} onOpenChange={setSignOutOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Are you sure you want to logout?</AlertDialogTitle>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>No</AlertDialogCancel>
            <Button onClick={() => signOutForm.current?.requestSubmit()}>Yes</Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

function CustomColorDialog({ open, onOpenChange, current, onApply }: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  current: string;
  onApply: (hex: string) => void;
}) {
  const [value, setValue] = useState(current);
  const [text, setText] = useState(current);
  const valid = /^#[0-9a-f]{6}$/i.test(text.trim());

  return (
    <DialogPrimitive.Root
      open={open}
      onOpenChange={(o) => {
        if (o) {
          setValue(current);
          setText(current);
        }
        onOpenChange(o);
      }}
    >
      <DialogPrimitive.Portal>
        <DialogPrimitive.Backdrop className="fixed inset-0 z-50 bg-black/10 supports-backdrop-filter:backdrop-blur-xs" />
        <DialogPrimitive.Popup className="fixed top-1/2 left-1/2 z-50 w-[calc(100vw-2rem)] max-w-sm -translate-x-1/2 -translate-y-1/2 rounded-xl bg-popover p-5 text-popover-foreground ring-1 ring-foreground/10 outline-none">
          <div className="flex items-center justify-between">
            <DialogPrimitive.Title className="text-base font-semibold">Background color</DialogPrimitive.Title>
            <DialogPrimitive.Close aria-label="Close" className="rounded-full p-1 text-muted-foreground hover:bg-muted hover:text-foreground"><X className="size-4" /></DialogPrimitive.Close>
          </div>
          <div className="mt-4 flex items-center gap-3">
            <label className="relative grid size-12 shrink-0 cursor-pointer place-items-center overflow-hidden rounded-lg ring-1 ring-foreground/15" style={{ backgroundColor: value }} title="Pick a color">
              <Pipette className="size-4 mix-blend-difference text-white" aria-hidden />
              <input
                type="color"
                value={value}
                onChange={(e) => {
                  setValue(e.target.value);
                  setText(e.target.value);
                }}
                className="absolute inset-0 cursor-pointer opacity-0"
                aria-label="Pick a color"
              />
            </label>
            <div className="flex-1 space-y-1">
              <span className="block text-xs text-muted-foreground">Hex code</span>
              <Input
                value={text}
                onChange={(e) => {
                  setText(e.target.value);
                  const t = e.target.value.trim();
                  if (/^#[0-9a-f]{6}$/i.test(t)) setValue(t.toLowerCase());
                }}
                placeholder="#ffffff"
                aria-invalid={!valid}
              />
            </div>
          </div>
          <div className="mt-5 flex justify-between gap-2">
            <Button variant="ghost" onClick={() => { onApply(DEFAULT_BG); onOpenChange(false); }}>Reset to white</Button>
            <div className="flex gap-2">
              <DialogPrimitive.Close render={<Button variant="outline" />}>Cancel</DialogPrimitive.Close>
              <Button disabled={!valid} onClick={() => { onApply(value); onOpenChange(false); }}>Apply</Button>
            </div>
          </div>
        </DialogPrimitive.Popup>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
