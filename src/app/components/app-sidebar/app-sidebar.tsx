import type { CSSProperties, ReactNode } from "react";
import { Accordion } from "@/app/components/ui/accordion";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarHeader,
  SidebarProvider,
  SidebarRail,
  SidebarTrigger,
} from "@/app/components/ui/sidebar";
import { AddProjectDialog } from "@/app/components/app-sidebar/add-dialog/add-dialog";
import { Directory } from "@/app/components/app-sidebar/directory/directory";
import { SettingsDialog } from "@/app/components/app-sidebar/settings-dialog/settings-dialog";
import {
  useAppSidebarContent,
  useAppSidebarShell,
} from "@/app/components/app-sidebar/use-app-sidebar";
import { AudioLines, BookOpen, CalendarDays } from "lucide-react";
import { Button } from "@/app/components/ui/button";

function AppSidebarContent() {
  const { projects, projectPath, groups } = useAppSidebarContent();
  const { sidebarWidth, onSidebarWidthChange } = useAppSidebarShell();

  return (
    <>
      <Sidebar collapsible="icon" variant="inset">
        <SidebarHeader className="gap-1 px-3 py-4 group-data-[collapsible=icon]:items-center group-data-[collapsible=icon]:px-2">
          <div className="flex w-full items-center justify-between gap-2 text-sm font-semibold">
            <span className="flex min-w-0 items-center gap-2 group-data-[collapsible=icon]:hidden font-serif">
              Projects
            </span>
            <AddProjectDialog />
          </div>
        </SidebarHeader>
        <SidebarContent>
          <SidebarGroup className="pt-0">
            <SidebarGroupContent className="group-data-[collapsible=icon]:hidden">
              {projects.length > 0 && (
                <Accordion
                  defaultValue={groups.map((group) => group.directoryPath || "root")}
                  multiple
                  className="w-full"
                >
                  {groups.map((group) => (
                    <Directory
                      key={group.directoryPath || "root"}
                      directoryName={group.directoryName}
                      directoryPath={group.directoryPath}
                      items={group.items}
                      selectedProjectPath={projectPath}
                    />
                  ))}
                </Accordion>
              )}
            </SidebarGroupContent>
          </SidebarGroup>
        </SidebarContent>
        <SidebarFooter className="gap-1 px-3 py-3 group-data-[collapsible=icon]:px-2">
          <div className="flex flex-row items-center justify-end gap-1 group-data-[collapsible=icon]:flex-col">
            <Button
              type="button"
              size="icon-sm"
              variant="ghost"
              title="G2P review"
              aria-label="G2P review"
              render={
                <a href="/g2p-review" target="_blank" rel="noreferrer">
                  <AudioLines className="size-4" />
                </a>
              }
            />
            <Button
              type="button"
              size="icon-sm"
              variant="ghost"
              title="Dictionary"
              aria-label="Dictionary"
              render={
                <a href="/dictionary" target="_blank" rel="noreferrer">
                  <BookOpen className="size-4" />
                </a>
              }
            />
            <Button
              type="button"
              size="icon-sm"
              variant="ghost"
              title="Settings"
              aria-label="Settings"
              render={
                <a href="/schedules">
                  <CalendarDays className="size-4" />
                </a>
              }
            />
            <SettingsDialog />
            <SidebarTrigger />
          </div>
        </SidebarFooter>
        <SidebarRail width={sidebarWidth} onWidthChange={onSidebarWidthChange} />
      </Sidebar>
    </>
  );
}

export function AppSidebar({ children }: { children: ReactNode }) {
  const { open, onOpenChange, sidebarWidth } = useAppSidebarShell();

  return (
    <SidebarProvider
      open={open}
      onOpenChange={onOpenChange}
      className="h-svh overflow-hidden"
      style={{ "--sidebar-width": `${sidebarWidth}px` } as CSSProperties}
    >
      <AppSidebarContent />
      {children}
    </SidebarProvider>
  );
}
