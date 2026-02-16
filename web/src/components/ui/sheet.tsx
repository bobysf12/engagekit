import * as React from "react";
import { createPortal } from "react-dom";
import { cn } from "@/lib/utils";

interface SheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  children: React.ReactNode;
}

const SheetContext = React.createContext<{
  open: boolean;
  onOpenChange: (open: boolean) => void;
}>({ open: false, onOpenChange: () => {} });

function Sheet({ open, onOpenChange, children }: SheetProps) {
  React.useEffect(() => {
    if (open) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [open]);

  return (
    <SheetContext.Provider value={{ open, onOpenChange }}>
      {children}
    </SheetContext.Provider>
  );
}

const SheetOverlay = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn("fixed inset-0 z-[9998] bg-black/60", className)}
    {...props}
  />
));
SheetOverlay.displayName = "SheetOverlay";

const SheetContent = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement> & { side?: "bottom" | "top" }
>(({ className, children, side = "bottom", ...props }, ref) => {
  const { open, onOpenChange } = React.useContext(SheetContext);

  if (!open || typeof document === "undefined") return null;

  return createPortal(
    <>
      <SheetOverlay onClick={() => onOpenChange(false)} />
      <div
        ref={ref}
        className={cn(
          "fixed z-[9999] bg-background border-border shadow-xl",
          side === "bottom" &&
            "left-0 right-0 bottom-0 rounded-t-2xl border-t max-h-[85dvh] overflow-y-auto",
          side === "top" &&
            "left-0 right-0 top-0 rounded-b-2xl border-b max-h-[85dvh] overflow-y-auto",
          className
        )}
        {...props}
      >
        {side === "bottom" && (
          <div className="flex justify-center pt-3 pb-2 sticky top-0 bg-background z-10">
            <div className="w-10 h-1 bg-muted-foreground/30 rounded-full" />
          </div>
        )}
        {children}
      </div>
    </>,
    document.body
  );
});
SheetContent.displayName = "SheetContent";

const SheetHeader = ({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) => (
  <div className={cn("flex flex-col space-y-2 px-4 pb-4", className)} {...props} />
);
SheetHeader.displayName = "SheetHeader";

const SheetFooter = ({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) => (
  <div
    className={cn(
      "flex flex-row gap-2 p-4 border-t border-border bg-background/95 sticky bottom-0",
      className
    )}
    {...props}
  />
);
SheetFooter.displayName = "SheetFooter";

const SheetTitle = React.forwardRef<
  HTMLHeadingElement,
  React.HTMLAttributes<HTMLHeadingElement>
>(({ className, ...props }, ref) => (
  <h2
    ref={ref}
    className={cn("text-lg font-semibold leading-none tracking-tight", className)}
    {...props}
  />
));
SheetTitle.displayName = "SheetTitle";

const SheetDescription = React.forwardRef<
  HTMLParagraphElement,
  React.HTMLAttributes<HTMLParagraphElement>
>(({ className, ...props }, ref) => (
  <p ref={ref} className={cn("text-sm text-muted-foreground", className)} {...props} />
));
SheetDescription.displayName = "SheetDescription";

export {
  Sheet,
  SheetOverlay,
  SheetContent,
  SheetHeader,
  SheetFooter,
  SheetTitle,
  SheetDescription,
};
