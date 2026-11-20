use gpui::{AnyElement, IntoElement, ParentElement, Pixels, Styled, div, px};
use gpui_component::resizable::{h_resizable, resizable_panel, v_resizable};

pub(crate) type PaneId = u64;
pub(crate) const PRIMARY_PANE: PaneId = 0;
const MAX_OPEN_PANES: usize = 12;
const MAX_CLOSED_PANES: usize = 12;

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub(crate) enum SplitDirection {
    Right,
    Down,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
enum NodeId {
    Pane(PaneId),
    Split(u64),
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
enum Side {
    Leading,
    Trailing,
}

#[derive(Debug, PartialEq, Eq)]
enum Node {
    Pane(PaneId),
    Split {
        id: u64,
        direction: SplitDirection,
        leading: Box<Node>,
        trailing: Box<Node>,
    },
}

#[derive(Debug, PartialEq, Eq)]
struct ClosedPane {
    pane: PaneId,
    split: u64,
    direction: SplitDirection,
    side: Side,
    anchor: NodeId,
}

pub(crate) struct PaneLayout {
    root: Node,
    closed: Vec<ClosedPane>,
    focused: PaneId,
    next_pane: PaneId,
    next_split: u64,
}

impl Default for PaneLayout {
    fn default() -> Self {
        Self {
            root: Node::Pane(PRIMARY_PANE),
            closed: Vec::new(),
            focused: PRIMARY_PANE,
            next_pane: 1,
            next_split: 1,
        }
    }
}

impl PaneLayout {
    pub(crate) fn open_count(&self) -> usize {
        self.root.open_count()
    }

    pub(crate) fn can_split(&self) -> bool {
        self.open_count() < MAX_OPEN_PANES
    }

    pub(crate) fn can_reopen(&self) -> bool {
        !self.closed.is_empty() && self.can_split()
    }

    pub(crate) fn retains(&self, pane: PaneId) -> bool {
        self.root.contains(NodeId::Pane(pane)) || self.closed.iter().any(|item| item.pane == pane)
    }

    pub(crate) fn focused(&self) -> PaneId {
        self.focused
    }

    pub(crate) fn focus(&mut self, pane: PaneId) -> bool {
        if self.focused == pane || !self.root.contains(NodeId::Pane(pane)) {
            return false;
        }
        self.focused = pane;
        true
    }

    pub(crate) fn cycle_focus(&mut self) -> PaneId {
        let mut panes = Vec::with_capacity(self.open_count());
        self.root.collect_panes(&mut panes);
        let next = panes
            .iter()
            .position(|pane| *pane == self.focused)
            .map_or(0, |index| (index + 1) % panes.len());
        self.focused = panes[next];
        self.focused
    }

    pub(crate) fn split(&mut self, anchor: PaneId, direction: SplitDirection) -> Option<PaneId> {
        if !self.can_split() {
            return None;
        }
        let target = self.root.find(NodeId::Pane(anchor))?;
        let pane = self.next_pane;
        self.next_pane += 1;
        let split = self.next_split;
        self.next_split += 1;
        target.insert(pane, split, direction, Side::Trailing);
        self.focused = pane;
        Some(pane)
    }

    pub(crate) fn close(&mut self, pane: PaneId) -> bool {
        if pane == PRIMARY_PANE || !self.root.contains(NodeId::Pane(pane)) {
            return false;
        }
        let root = std::mem::replace(&mut self.root, Node::Pane(PRIMARY_PANE));
        let (root, closed) = root.without(pane);
        self.root = root;
        let Some(closed) = closed else {
            return false;
        };
        if self.focused == pane {
            self.focused = self
                .root
                .find(closed.anchor)
                .map_or(PRIMARY_PANE, |anchor| anchor.first_pane());
        }
        if self.closed.len() == MAX_CLOSED_PANES {
            self.closed.remove(0);
        }
        self.closed.push(closed);
        true
    }

    pub(crate) fn reopen(&mut self) -> Option<PaneId> {
        if !self.can_reopen() {
            return None;
        }
        let closed = self.closed.pop()?;
        // Reattach to the original sibling subtree when it is still present.
        // A subsequent close may have removed it. Reopen at the focused pane
        // in that case, with the original split direction and side.
        let anchor = if self.root.contains(closed.anchor) {
            closed.anchor
        } else {
            NodeId::Pane(self.focused)
        };
        let target = self.root.find(anchor).expect("open pane anchor");
        target.insert(closed.pane, closed.split, closed.direction, closed.side);
        self.focused = closed.pane;
        Some(closed.pane)
    }

    pub(crate) fn render(
        &self,
        primary: AnyElement,
        mut render_auxiliary: impl FnMut(PaneId) -> AnyElement,
    ) -> AnyElement {
        self.root.render(&mut Some(primary), &mut render_auxiliary)
    }
}

impl Node {
    fn id(&self) -> NodeId {
        match self {
            Self::Pane(pane) => NodeId::Pane(*pane),
            Self::Split { id, .. } => NodeId::Split(*id),
        }
    }

    fn contains(&self, target: NodeId) -> bool {
        self.id() == target
            || match self {
                Self::Pane(_) => false,
                Self::Split {
                    leading, trailing, ..
                } => leading.contains(target) || trailing.contains(target),
            }
    }

    fn open_count(&self) -> usize {
        match self {
            Self::Pane(_) => 1,
            Self::Split {
                leading, trailing, ..
            } => leading.open_count() + trailing.open_count(),
        }
    }

    fn first_pane(&self) -> PaneId {
        match self {
            Self::Pane(pane) => *pane,
            Self::Split { leading, .. } => leading.first_pane(),
        }
    }

    fn collect_panes(&self, panes: &mut Vec<PaneId>) {
        match self {
            Self::Pane(pane) => panes.push(*pane),
            Self::Split {
                leading, trailing, ..
            } => {
                leading.collect_panes(panes);
                trailing.collect_panes(panes);
            }
        }
    }

    fn find(&mut self, anchor: NodeId) -> Option<&mut Self> {
        if self.id() == anchor {
            return Some(self);
        }
        match self {
            Self::Pane(_) => None,
            Self::Split {
                leading, trailing, ..
            } => leading.find(anchor).or_else(|| trailing.find(anchor)),
        }
    }

    fn insert(&mut self, pane: PaneId, id: u64, direction: SplitDirection, side: Side) {
        let previous = std::mem::replace(self, Self::Pane(pane));
        let new_pane = Self::Pane(pane);
        let (leading, trailing) = match side {
            Side::Leading => (new_pane, previous),
            Side::Trailing => (previous, new_pane),
        };
        *self = Self::Split {
            id,
            direction,
            leading: Box::new(leading),
            trailing: Box::new(trailing),
        };
    }

    fn without(self, pane: PaneId) -> (Self, Option<ClosedPane>) {
        let Self::Split {
            id,
            direction,
            leading,
            trailing,
        } = self
        else {
            return (self, None);
        };
        if leading.id() == NodeId::Pane(pane) {
            let closed = ClosedPane {
                pane,
                split: id,
                direction,
                side: Side::Leading,
                anchor: trailing.id(),
            };
            return (*trailing, Some(closed));
        }
        if trailing.id() == NodeId::Pane(pane) {
            let closed = ClosedPane {
                pane,
                split: id,
                direction,
                side: Side::Trailing,
                anchor: leading.id(),
            };
            return (*leading, Some(closed));
        }
        let (leading, closed) = leading.without(pane);
        let (trailing, closed) = match closed {
            Some(closed) => (*trailing, Some(closed)),
            None => trailing.without(pane),
        };
        (
            Self::Split {
                id,
                direction,
                leading: Box::new(leading),
                trailing: Box::new(trailing),
            },
            closed,
        )
    }

    fn render(
        &self,
        primary: &mut Option<AnyElement>,
        render_auxiliary: &mut impl FnMut(PaneId) -> AnyElement,
    ) -> AnyElement {
        match self {
            Self::Pane(PRIMARY_PANE) => primary.take().expect("one primary pane"),
            Self::Pane(pane) => render_auxiliary(*pane),
            Self::Split {
                id,
                direction,
                leading,
                trailing,
            } => {
                let element_id = ("canvas-split", *id);
                let group = match direction {
                    SplitDirection::Right => h_resizable(element_id),
                    SplitDirection::Down => v_resizable(element_id),
                };
                let panel = |child| {
                    resizable_panel().size_range(px(96.)..Pixels::MAX).child(
                        div()
                            .size_full()
                            .min_h_0()
                            .min_w_0()
                            .overflow_hidden()
                            .child(child),
                    )
                };
                group
                    .child(panel(leading.render(primary, render_auxiliary)))
                    .child(panel(trailing.render(primary, render_auxiliary)))
                    .into_any_element()
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn split_close_reopen_keeps_pane_identity_and_topology() {
        let mut layout = PaneLayout::default();
        let right = layout.split(PRIMARY_PANE, SplitDirection::Right).unwrap();
        let bottom_right = layout.split(right, SplitDirection::Down).unwrap();

        assert!(!layout.close(PRIMARY_PANE));
        assert_eq!(layout.focused(), bottom_right);
        assert!(layout.focus(right));
        assert!(layout.close(right));
        assert_eq!(layout.focused(), bottom_right);
        assert!(!layout.focus(right));
        assert!(layout.retains(right));
        assert_eq!(layout.reopen(), Some(right));
        assert_eq!(layout.focused(), right);
        assert_eq!(
            layout.root,
            Node::Split {
                id: 1,
                direction: SplitDirection::Right,
                leading: Box::new(Node::Pane(PRIMARY_PANE)),
                trailing: Box::new(Node::Split {
                    id: 2,
                    direction: SplitDirection::Down,
                    leading: Box::new(Node::Pane(right)),
                    trailing: Box::new(Node::Pane(bottom_right)),
                }),
            }
        );
    }

    #[test]
    fn reopening_recovers_from_a_changed_anchor_without_a_duplicate_leaf() {
        let mut layout = PaneLayout::default();
        let right = layout.split(PRIMARY_PANE, SplitDirection::Right).unwrap();
        let bottom_right = layout.split(right, SplitDirection::Down).unwrap();
        assert!(layout.close(right));
        assert!(layout.close(bottom_right));
        // The most recent pane is able to reopen first, then the earlier
        // opposite-side pane restores its place relative to that identity.
        assert_eq!(layout.reopen(), Some(bottom_right));
        assert_eq!(layout.reopen(), Some(right));
        assert_eq!(layout.open_count(), 3);
        assert!(!layout.can_reopen());
        assert_eq!(layout.reopen(), None);
    }

    #[test]
    fn bounds_open_and_closed_panes_independently() {
        let mut layout = PaneLayout::default();
        for _ in 1..MAX_OPEN_PANES {
            assert!(layout.split(PRIMARY_PANE, SplitDirection::Right).is_some());
        }
        assert_eq!(layout.open_count(), MAX_OPEN_PANES);
        assert!(!layout.can_split());
        assert_eq!(layout.split(PRIMARY_PANE, SplitDirection::Down), None);
        let first = layout.focused();
        assert!(layout.close(first));
        assert!(layout.can_reopen());
        for _ in 0..MAX_CLOSED_PANES {
            let pane = layout.split(PRIMARY_PANE, SplitDirection::Down).unwrap();
            assert!(layout.close(pane));
        }
        assert_eq!(layout.open_count(), MAX_OPEN_PANES - 1);
        assert!(!layout.retains(first));
        assert!(layout.retains(layout.closed[0].pane));
        assert!(layout.reopen().is_some());
        assert!(!layout.can_reopen());
    }

    #[test]
    fn cycles_open_panes_in_visual_order_and_skips_closed_panes() {
        let mut layout = PaneLayout::default();
        let right = layout.split(PRIMARY_PANE, SplitDirection::Right).unwrap();
        let below = layout.split(PRIMARY_PANE, SplitDirection::Down).unwrap();
        assert_eq!(layout.cycle_focus(), right);
        assert_eq!(layout.cycle_focus(), PRIMARY_PANE);
        assert!(layout.close(below));
        assert_eq!(layout.cycle_focus(), right);
        assert_eq!(layout.cycle_focus(), PRIMARY_PANE);
    }

    #[test]
    fn render_requests_each_open_auxiliary_exactly_once_in_visual_order() {
        let mut layout = PaneLayout::default();
        let right = layout.split(PRIMARY_PANE, SplitDirection::Right).unwrap();
        let below = layout.split(PRIMARY_PANE, SplitDirection::Down).unwrap();
        let hidden = layout.split(right, SplitDirection::Down).unwrap();
        assert!(layout.close(hidden));

        let mut rendered = Vec::new();
        let _tree = layout.render(div().into_any_element(), |pane| {
            rendered.push(pane);
            div().into_any_element()
        });
        assert_eq!(rendered, [below, right]);
    }
}
