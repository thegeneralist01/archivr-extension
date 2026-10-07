import { send } from "./bridge";
import { showToast } from "./dialog";
import {
  contextSnapshotForPage,
  mediaTargetFromElement,
  xMediaMenuLocator,
  type ContextSnapshot,
} from "./site-targets";

const VIDEO_MENU_LABELS = [
  "copy video address",
  "copy link at current time",
  "post video",
];
const MENU_LIFETIME_MS = 30_000;
const MENU_DISCOVERY_MS = 1_500;
const MAX_PENDING_ROOTS = 24;

type MenuSession = {
  page: string;
  snapshot: ContextSnapshot;
  target: Element;
  observer: MutationObserver;
  discoveryTimer: number;
  lifetimeTimer: number;
  afterEventTimer: number;
  reconcileTimer?: number;
  navigationTimer?: number;
  menu?: HTMLElement;
  action?: HTMLElement;
  discoveryReady: boolean;
  pending: Element[];
  activating: boolean;
  disposed: boolean;
};

function menuText(element: Element) {
  return (element.textContent || "").replace(/\s+/g, " ").trim().toLowerCase();
}

function menuCandidate(element: Element) {
  if (!(element instanceof HTMLElement) || !element.matches('[data-testid="Dropdown"]'))
    return undefined;
  const items = Array.from(element.children).filter(
    (child): child is HTMLElement =>
      child instanceof HTMLElement && child.getAttribute("role") === "menuitem",
  );
  const labels = new Set(items.map(menuText));
  return VIDEO_MENU_LABELS.every((label) => labels.has(label)) ? items : undefined;
}

function candidateNear(element: Element) {
  const root = element.matches('[data-testid="Dropdown"]')
    ? element
    : element.closest('[data-testid="Dropdown"]');
  const items = root && menuCandidate(root);
  return root instanceof HTMLElement && items ? { menu: root, items } : undefined;
}

function visible(menu: HTMLElement) {
  return menu.isConnected && !menu.closest('[hidden], [aria-hidden="true"]') && menu.getClientRects().length > 0 &&
    getComputedStyle(menu).display !== "none" && getComputedStyle(menu).visibility !== "hidden";
}

export function installXVideoMenu() {
  let active: MenuSession | undefined;

  const dispose = (session = active) => {
    if (!session || session.disposed) return;
    session.disposed = true;
    session.observer.disconnect();
    clearTimeout(session.discoveryTimer);
    clearTimeout(session.lifetimeTimer);
    clearTimeout(session.afterEventTimer);
    if (session.reconcileTimer) clearInterval(session.reconcileTimer);
    if (session.navigationTimer) clearInterval(session.navigationTimer);
    session.pending.length = 0;
    session.action?.remove();
    if (active === session) active = undefined;
  };

  const sessionStillMatches = (session: MenuSession) => {
    const snapshot = contextSnapshotForPage(session.snapshot, location.href);
    const media = session.target.isConnected
      ? mediaTargetFromElement(session.target)
      : undefined;
    return location.href === session.page && !!snapshot &&
      media?.id === snapshot.statusId && xMediaMenuLocator(snapshot);
  };

  const addAction = (session: MenuSession, menu: HTMLElement, items: HTMLElement[]) => {
    if (session.disposed || session.action || !visible(menu) || menu.querySelector("[data-archivr-video-menu]"))
      return;
    const template = items[0]!;
    const action = document.createElement(template.tagName);
    // X's row classes supply the host presentation, without copying IDs,
    // mutable attributes, or any inline event handlers from its template.
    action.className = template.className;
    // X puts typography on a nested label, rather than on the menu row.
    const labelStyle = getComputedStyle(template.querySelector("span") || template);
    action.style.font = labelStyle.font;
    action.style.color = labelStyle.color;
    const direction = template.getAttribute("dir");
    if (direction) action.setAttribute("dir", direction);
    action.dataset.archivrVideoMenu = "";
    action.setAttribute("role", "menuitem");
    action.setAttribute("aria-label", "Archive video");
    action.tabIndex = 0;
    action.textContent = "";
    const logo = document.createElement("img");
    logo.src = chrome.runtime.getURL("logo-mark.svg");
    logo.alt = "";
    logo.setAttribute("aria-hidden", "true");
    logo.style.height = "1.5em";
    logo.style.aspectRatio = "1 / 1";
    logo.style.borderRadius = "4px";
    logo.style.margin = "auto 0.5em auto 0";
    logo.style.flex = "0 0 auto";
    logo.style.objectFit = "cover";
    action.append(logo, document.createTextNode("Archive video"));
    const activate = () => {
      if (session.activating || session.disposed || active !== session ||
          action.parentElement !== menu || !visible(menu) || !visible(action) || !menuCandidate(menu)) return;
      session.activating = true;
      const locator = sessionStillMatches(session);
      dispose(session);
      if (locator)
        send("OPEN_TARGET", { url: locator }).catch((error) =>
          showToast(error instanceof Error ? error.message : "Unable to open Archivr."),
        );
    };
    const suppressAndActivate = (event: Event) => {
      event.preventDefault();
      event.stopImmediatePropagation();
      activate();
    };
    action.addEventListener("click", suppressAndActivate, true);
    action.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === " ") suppressAndActivate(event);
    }, true);
    items[0]!.after(action);
    session.menu = menu;
    session.action = action;
    session.pending.length = 0;
    session.navigationTimer = window.setInterval(() => {
      if (location.href !== session.page) dispose(session);
    }, 250);
  };

  const reconcile = (session: MenuSession) => {
    if (session.disposed) return;
    if (location.href !== session.page) {
      dispose(session);
      return;
    }
    if (session.menu && !session.menu.isConnected) {
      session.menu = undefined;
      session.action = undefined;
    }
    if (session.menu && !visible(session.menu)) {
      dispose(session);
      return;
    }
    if (session.menu && !menuCandidate(session.menu)) {
      dispose(session);
      return;
    }
    if (session.action && session.action.isConnected && session.action.parentElement === session.menu)
      return;
    session.action = undefined;
    for (const menu of document.querySelectorAll('[data-testid="Dropdown"]')) {
      const items = menuCandidate(menu);
      if (menu instanceof HTMLElement && items && visible(menu)) {
        addAction(session, menu, items);
        return;
      }
    }
  };

  const inspect = (session: MenuSession, element: Element) => {
    if (session.disposed || session.action || element.closest("[data-archivr-video-menu]")) return;
    const candidate = candidateNear(element);
    if (candidate) addAction(session, candidate.menu, candidate.items);
    // React may append an entire portal containing Dropdown in one mutation.
    if (!session.action)
      for (const root of element.querySelectorAll('[data-testid="Dropdown"]')) {
        const items = menuCandidate(root);
        if (root instanceof HTMLElement && items) addAction(session, root, items);
        if (session.action) break;
      }
  };

  const lifecycleChanged = (session: MenuSession) => {
    reconcile(session);
  };

  const observe = (event: MouseEvent, snapshot: ContextSnapshot) => {
    dispose();
    const target = event.target instanceof Element ? event.target : undefined;
    if (!target || !xMediaMenuLocator(snapshot) || snapshot.page !== location.href) return;
    const session: MenuSession = {
      page: location.href,
      snapshot,
      target,
      observer: undefined as unknown as MutationObserver,
      discoveryTimer: 0,
      lifetimeTimer: 0,
      afterEventTimer: 0,
      discoveryReady: false,
      pending: [],
      activating: false,
      disposed: false,
    };
    active = session;
    session.observer = new MutationObserver((records) => {
      if (session.disposed) return;
      if (session.action) {
        lifecycleChanged(session);
        return;
      }
      for (const record of records) {
        for (const node of record.addedNodes) {
          if (node instanceof Element && session.pending.length < MAX_PENDING_ROOTS)
            session.pending.push(node);
        }
      }
      if (session.discoveryReady) {
        while (session.pending.length && !session.disposed && !session.action)
          inspect(session, session.pending.shift()!);
      }
    });
    session.observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ["hidden", "aria-hidden", "style"] });
    session.reconcileTimer = window.setInterval(() => reconcile(session), 100);
    // Capture runs before X's bubble handler. A task runs after the event
    // dispatch completes, so a trusted right-click can be cancelled by X.
    session.afterEventTimer = window.setTimeout(() => {
      if (session.disposed || !event.defaultPrevented) {
        dispose(session);
        return;
      }
      session.discoveryReady = true;
      for (const menu of document.querySelectorAll('[data-testid="Dropdown"]'))
        inspect(session, menu);
      while (session.pending.length && !session.disposed && !session.action)
        inspect(session, session.pending.shift()!);
    }, 0);
    session.discoveryTimer = window.setTimeout(() => {
      if (!session.action) dispose(session);
    }, MENU_DISCOVERY_MS);
    session.lifetimeTimer = window.setTimeout(() => dispose(session), MENU_LIFETIME_MS);
  };

  window.addEventListener("popstate", () => dispose());
  window.addEventListener("hashchange", () => dispose());
  window.addEventListener("pagehide", () => dispose());
  return { observe };
}
