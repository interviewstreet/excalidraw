import { Action, ActionResult } from "./types";
import { undo, redo } from "../components/icons";
import { ToolButton } from "../components/ToolButton";
import { t } from "../i18n";
import History, { HistoryEntry } from "../history";
import { ExcalidrawElement } from "../element/types";
import { AppState } from "../types";
import { isWindows, KEYS } from "../keys";
import { newElementWith } from "../element/mutateElement";
import { fixBindingsAfterDeletion } from "../element/binding";
import { arrayToMap } from "../utils";
import { isCommentElement } from "../element/typeChecks";

const writeData = (
  prevElements: readonly ExcalidrawElement[],
  appState: AppState,
  updater: () => HistoryEntry | null,
): ActionResult => {
  const commitToHistory = false;
  if (
    !appState.multiElement &&
    !appState.resizingElement &&
    !appState.editingElement &&
    !appState.draggingElement
  ) {
    const data = updater();
    if (data === null) {
      return { commitToHistory };
    }

    const prevElementMap = arrayToMap(prevElements);
    const nextElements = data.elements;
    const nextElementMap = arrayToMap(nextElements);

    const deletedElements = prevElements.filter(
      (prevElement) => !nextElementMap.has(prevElement.id),
    );

    const shouldNotDeleteCommentElementsMap = arrayToMap(
      prevElements.filter((e) => {
        return isCommentElement(e) && !nextElementMap.has(e.id);
      }),
    );

    const elements = nextElements
      .map((nextElement) => {
        if (isCommentElement(nextElement)) {
          // case #1: if comment is previously deleted it shouldn't rendered again;
          // example: (1) Add comment (2) Delete it (3) on UNDO/REDO operation, comment shouldn't render
          if (
            prevElementMap.has(nextElement.id) &&
            prevElementMap.get(nextElement.id)?.isDeleted
          ) {
            return newElementWith(nextElement, { isDeleted: true });
          }
        }
        return newElementWith(
          prevElementMap.get(nextElement.id) || nextElement,
          nextElement,
        );
      })
      .concat(
        // case #2: if comment is previously added it shouldn't be deleted unless forceDeleted by parent (HackerDraw)
        // example: (1) Add comment (2) on UNDO/REDO operation, comment shouldn't delete
        deletedElements.map((prevElement) =>
          newElementWith(prevElement, {
            isDeleted: !shouldNotDeleteCommentElementsMap.has(prevElement.id),
          }),
        ),
      );
    fixBindingsAfterDeletion(elements, deletedElements);
    return {
      elements,
      appState: { ...appState, ...data.appState },
      commitToHistory,
      syncHistory: true,
    };
  }
  return { commitToHistory };
};

type ActionCreator = (history: History) => Action;

export const createUndoAction: ActionCreator = (history) => ({
  name: "undo",
  trackEvent: { category: "history" },
  perform: (elements, appState) =>
    writeData(elements, appState, () => history.undoOnce()),
  keyTest: (event) =>
    event[KEYS.CTRL_OR_CMD] &&
    event.key.toLowerCase() === KEYS.Z &&
    !event.shiftKey,
  PanelComponent: ({ updateData, data }) => (
    <ToolButton
      type="button"
      icon={undo}
      aria-label={t("buttons.undo")}
      onClick={updateData}
      size={data?.size || "medium"}
    />
  ),
  commitToHistory: () => false,
});

export const createRedoAction: ActionCreator = (history) => ({
  name: "redo",
  trackEvent: { category: "history" },
  perform: (elements, appState) =>
    writeData(elements, appState, () => history.redoOnce()),
  keyTest: (event) =>
    (event[KEYS.CTRL_OR_CMD] &&
      event.shiftKey &&
      event.key.toLowerCase() === KEYS.Z) ||
    (isWindows && event.ctrlKey && !event.shiftKey && event.key === KEYS.Y),
  PanelComponent: ({ updateData, data }) => (
    <ToolButton
      type="button"
      icon={redo}
      aria-label={t("buttons.redo")}
      onClick={updateData}
      size={data?.size || "medium"}
    />
  ),
  commitToHistory: () => false,
});
