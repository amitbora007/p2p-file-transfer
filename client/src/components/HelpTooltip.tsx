import { useState } from "react";
import { HelpCircle } from "lucide-react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

interface HelpTooltipProps {
  content: string;
  side?: "top" | "right" | "bottom" | "left";
}

export function HelpTooltip({ content, side = "bottom" }: HelpTooltipProps) {
  const [open, setOpen] = useState(false);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          onClick={() => setOpen((prev) => !prev)}
          onMouseEnter={() => setOpen(true)}
          onMouseLeave={() => setOpen(false)}
          className="inline-flex items-center justify-center p-1 rounded-full text-slate-400 hover:text-slate-600 focus:outline-none cursor-pointer transition-colors active:scale-95 touch-manipulation"
          aria-label="Help information"
        >
          <HelpCircle className="w-4 h-4" />
        </button>
      </PopoverTrigger>
      <PopoverContent
        side={side}
        align="center"
        className="max-w-xs w-auto text-xs font-medium z-50 bg-slate-900 text-slate-100 border border-slate-800 p-3 rounded-xl shadow-xl pointer-events-none"
      >
        <p className="leading-relaxed">{content}</p>
      </PopoverContent>
    </Popover>
  );
}
