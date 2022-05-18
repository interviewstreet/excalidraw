import { isSomeElementSelected } from "../scene";
import { KEYS } from "../keys";
import { ToolButton } from "../components/ToolButton";
import { trash } from "../components/icons";
import { t } from "../i18n";
import { register } from "./register";
import { getNonDeletedElements } from "../element";
import { ExcalidrawCommentElement, ExcalidrawElement } from "../element/types";
import { AppState, UserProp } from "../types";
import { newElementWith } from "../element/mutateElement";
import { getElementsInGroup } from "../groups";
import { LinearElementEditor } from "../element/linearElementEditor";
import { fixBindingsAfterDeletion } from "../element/binding";
import { isBoundToContainer, isCommentElement } from "../element/typeChecks";

const deleteSelectedElements = (
  elements: readonly ExcalidrawElement[],
  appState: AppState,
  onDeleteCommentElements?: (deletedCommentElementIDs: Array<string>) => void,
  currentUser?: UserProp,
) => {
  let isActiveCommentDeleted = false;
  const deletedCommentElementIDs: string[] = [];
  const nextElements = elements.map((el) => {
    if (appState.selectedElementIds[el.id]) {
      if (appState.activeComment?.element.id === el.id) {
        isActiveCommentDeleted = true;
      }
      if (isCommentElement(el) && currentUser) {
        if (el.owner.email !== currentUser.email) {
          return el;
        }
        deletedCommentElementIDs.push(el.commentID);
      }
      return newElementWith(el, { isDeleted: true });
    }
    if (isBoundToContainer(el) && appState.selectedElementIds[el.containerId]) {
      if (appState.activeComment?.element.id === el.id) {
        isActiveCommentDeleted = true;
      }
      if (isCommentElement(el) && currentUser) {
        if (
          (el as ExcalidrawCommentElement).owner.email !== currentUser.email
        ) {
          return el;
        }
        deletedCommentElementIDs.push(
          (el as ExcalidrawCommentElement).commentID,
        );
      }
      return newElementWith(el, { isDeleted: true });
    }
    return el;
  });
  if (deletedCommentElementIDs.length) {
    onDeleteCommentElements?.(deletedCommentElementIDs);
  }
  return {
    elements: nextElements,
    appState: {
      ...appState,
      activeComment: isActiveCommentDeleted ? null : appState.activeComment,
      selectedElementIds: {},
    },
  };
};

const handleGroupEditingState = (
  appState: AppState,
  elements: readonly ExcalidrawElement[],
): AppState => {
  if (appState.editingGroupId) {
    const siblingElements = getElementsInGroup(
      getNonDeletedElements(elements),
      appState.editingGroupId!,
    );
    if (siblingElements.length) {
      return {
        ...appState,
        selectedElementIds: { [siblingElements[0].id]: true },
      };
    }
  }
  return appState;
};

export const actionDeleteSelected = register({
  name: "deleteSelectedElements",
  trackEvent: { category: "element", action: "delete" },
  perform: (elements, appState, _, app) => {
    if (appState.editingLinearElement) {
      const {
        elementId,
        selectedPointsIndices,
        startBindingElement,
        endBindingElement,
      } = appState.editingLinearElement;
      const element = LinearElementEditor.getElement(elementId);
      if (!element) {
        return false;
      }
      if (
        // case: no point selected → delete whole element
        selectedPointsIndices == null ||
        // case: deleting last remaining point
        element.points.length < 2
      ) {
        const nextElements = elements.filter((el) => el.id !== element.id);
        const nextAppState = handleGroupEditingState(appState, nextElements);

        return {
          elements: nextElements,
          appState: {
            ...nextAppState,
            editingLinearElement: null,
          },
          commitToHistory: false,
        };
      }

      // We cannot do this inside `movePoint` because it is also called
      // when deleting the uncommitted point (which hasn't caused any binding)
      const binding = {
        startBindingElement: selectedPointsIndices?.includes(0)
          ? null
          : startBindingElement,
        endBindingElement: selectedPointsIndices?.includes(
          element.points.length - 1,
        )
          ? null
          : endBindingElement,
      };

      LinearElementEditor.deletePoints(element, selectedPointsIndices);

      return {
        elements,
        appState: {
          ...appState,
          editingLinearElement: {
            ...appState.editingLinearElement,
            ...binding,
            selectedPointsIndices:
              selectedPointsIndices?.[0] > 0
                ? [selectedPointsIndices[0] - 1]
                : [0],
          },
        },
        commitToHistory: true,
      };
    }
    let { elements: nextElements, appState: nextAppState } =
      deleteSelectedElements(
        elements,
        appState,
        app.props.onDeleteCommentElements,
        app.props.user,
      );
    fixBindingsAfterDeletion(
      nextElements,
      elements.filter(({ id }) => appState.selectedElementIds[id]),
    );

    nextAppState = handleGroupEditingState(nextAppState, nextElements);

    return {
      elements: nextElements,
      appState: {
        ...nextAppState,
        activeTool: { ...appState.activeTool, type: "selection" },
        multiElement: null,
      },
      commitToHistory: isSomeElementSelected(
        getNonDeletedElements(elements),
        appState,
      ),
    };
  },
  contextItemLabel: "labels.delete",
  keyTest: (event) => event.key === KEYS.BACKSPACE || event.key === KEYS.DELETE,
  PanelComponent: ({ elements, appState, updateData }) => (
    <ToolButton
      type="button"
      icon={trash}
      title={t("labels.delete")}
      aria-label={t("labels.delete")}
      onClick={() => updateData(null)}
      visible={isSomeElementSelected(getNonDeletedElements(elements), appState)}
    />
  ),
});
