import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

export interface AdminPageHeaderProps {
  eyebrow: string;
  title: string;
  description: ReactNode;
  icon?: LucideIcon;
  meta?: ReactNode;
  action?: ReactNode;
  metrics?: ReactNode;
  featured?: boolean;
  className?: string;
}

export function AdminPageHeader({
  eyebrow,
  title,
  description,
  icon: Icon,
  meta,
  action,
  metrics,
  featured = false,
  className,
}: AdminPageHeaderProps) {
  return (
    <section
      className={cn(
        "admin-page-header",
        featured && "admin-page-header-featured",
        className
      )}
    >
      <div className="admin-page-header-main">
        <div className="min-w-0">
          <div className="admin-eyebrow">
            {Icon && <Icon className="h-3.5 w-3.5" aria-hidden="true" />}
            <span>{eyebrow}</span>
          </div>
          <h1 className="admin-page-title text-balance">{title}</h1>
          <div className="admin-page-description text-pretty">{description}</div>
          {meta && <div className="admin-page-meta">{meta}</div>}
        </div>
        {action && <div className="admin-page-action">{action}</div>}
      </div>
      {metrics && <div className="admin-page-metrics">{metrics}</div>}
    </section>
  );
}

export interface AdminMetricCardProps {
  label: string;
  value: ReactNode;
  detail?: ReactNode;
  icon?: LucideIcon;
  tone?: "default" | "positive" | "warning" | "danger" | "info";
  className?: string;
}

export function AdminMetricCard({
  label,
  value,
  detail,
  icon: Icon,
  tone = "default",
  className,
}: AdminMetricCardProps) {
  return (
    <div className={cn("admin-metric-card", className)} data-tone={tone}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="admin-metric-label">{label}</p>
          <p className="admin-metric-value">{value}</p>
        </div>
        {Icon && (
          <span className="admin-metric-icon">
            <Icon className="h-5 w-5" aria-hidden="true" />
          </span>
        )}
      </div>
      {detail && <div className="admin-metric-detail">{detail}</div>}
    </div>
  );
}

export interface AdminToolbarProps {
  children: ReactNode;
  className?: string;
}

export function AdminToolbar({ children, className }: AdminToolbarProps) {
  return <div className={cn("admin-toolbar", className)}>{children}</div>;
}

