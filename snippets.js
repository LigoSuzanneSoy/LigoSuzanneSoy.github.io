{
  "snippets": {
    "contract-boilerplate-header": [
      "(* Simple auction contract *)",
      "",
      "(* Require Coq built-ins, declare LIGO built-ins and shorthands *)",
      "Require Import Notations.",
      "Require Import List.",
      "Require Import Nat.",
      "Import ListNotations.",
      "Notation \"()\" := tt.                (* tt means \"null\" or \"Unit\" in Coq *)",
      "Parameter tez : Type.",
      "Parameter operation : Type.             (* declare external LIGO type \"operation\" *)",
      "(*",
      "Definition operation : Type.        (* type operation = \u2026 *)",
      "(* could substitute with an actual implementation of operation as e.g. a string of bytes. *)",
      "exact (list nat).",
      "Qed. (* make it opaque. *)",
      "*)",
      "Parameter contract : Type -> Type.",
      "Parameter destination_account : contract unit.",
      "Parameter transaction : forall {param : Type} (action : param) (amount : tez), contract param -> operation.",
      "Parameter mutez : nat -> tez.",
      "",
      "(* Declare external LIGO function \"fail_in_main\". Note that it should only be",
      "   used once at the top-level of the \"main\" wrapper function. This is due to the",
      "   fact that Coq does not support exceptions or partial functions, so it must be",
      "   absolutely clear that the behaviour of failure is identical to a no-op contract.",
      "   See the explanation below in the section about extraction. *)",
      "Definition fail_in_main {A} (a : A) := a.",
      "",
      "(* ********************************************* *)",
      "(*                    Contract                   *)",
      "(* ********************************************* *)",
      ""
    ],
    "contract-type-storage": [
      "(* Declare enum for the storage (three states) *)",
      "Inductive storage :=",
      "| Available  : storage",
      "| CurrentBid : nat -> storage",
      "| Sold       : nat -> storage.",
      ""
    ],
    "contract-type-metadata": [],
    "contract-type-param": [
      "(* Declare enum for the parameter (two possible actions) *)",
      "Inductive param :=",
      "| Bid   : nat -> param",
      "| Claim : param.",
      ""
    ],
    "contract-main-option": [
      "(* Behaviour of the contract. *)",
      "Definition main_option (ps : param * storage) : option ((list operation) * storage) :=",
      "  match ps with",
      "  (* Start a bid *)",
      "  | (Bid newAmount, Available)                 => Some ([], CurrentBid newAmount)",
      "  (* New bid (must be higher than the existing *)",
      "  | (Bid newAmount, CurrentBid existingAmount) =>",
      "    if existingAmount <? newAmount then",
      "      Some ([], CurrentBid newAmount)",
      "    else",
      "      None",
      "  (* Finish the auction *)",
      "  | (Claim,         CurrentBid existingAmount) => Some ([transaction tt (mutez 0) destination_account], Sold existingAmount)",
      "  (* All other cases are errors. *)",
      "  | (_,             _storage)                  => None",
      "  end.",
      ""
    ],
    "contract-main-err": [
      "Definition main (ps : param * storage) : (list operation * storage) :=",
      "  match main_option ps with",
      "  (* On success, return the result *)",
      "  | Some result => result",
      "  (* On failure, return an empty list of operations and the unmodified storage *)",
      "  | None => fail_in_main ([], let (p,s) := ps in s)",
      "  end.",
      ""
    ],
    "contract-initial-storage": [
      "Definition initial_storage := Available.",
      "",
      "(* ********************************************* *)",
      "(*                End of Contract                *)",
      "(* ********************************************* *)",
      ""
    ],
    "contract-tactics-utils": [
      "Ltac subproof name :=",
      "  refine ?[name]; shelve.",
      "",
      "Ltac check_is_ctor ctor c :=",
      "match c with",
      "| ctor => idtac",
      "| ?f _ => check_is_ctor ctor f",
      "end.",
      "",
      "Tactic Notation \"when\" constr(ctor) ident_list(pat) \"as\" ident(H) :=",
      "intros pat;",
      "match goal with",
      "| |- _ = ?c -> _ => check_is_ctor ctor c",
      "| _ => fail \"wrong constructor, expected\" ctor",
      "end;",
      "intro H."
    ],
    "filter_args": [
      "Require Import List.",
      "Import ListNotations.",
      "",
      "Fixpoint filter_args {state : Type} {arg : Type} (valid : state -> arg -> bool) f (s : state) (l : list arg) :=",
      "  match l with",
      "  | [] => []",
      "  | hd :: tl =>",
      "    if valid s hd",
      "    then",
      "      hd :: (filter_args valid f (f s hd) tl)",
      "    else",
      "            (filter_args valid f (f s hd) tl)",
      "  end."
    ],
    "lemma_fold_invariant_aux-header": [
      "Require Import List.",
      "Import ListNotations.",
      "",
      "Lemma fold_left_cons :",
      "  forall (A B : Type) (f : A -> B -> A) (x : B) (l : list B) (i : A),",
      "    fold_left f (x :: l) i = fold_left f l (f i x).",
      "intros A B f x l i.",
      "fold ([x] ++ l).",
      "rewrite fold_left_app.",
      "reflexivity.",
      "Qed.",
      "",
      "Definition Psnd {A B BB : Type} (P : A -> B -> Prop) a (b : BB * B) : Prop := P a (snd b).",
      "",
      "Program Definition Psnd_rw :",
      "  forall A B BB (P : A -> B -> Prop) a (b : BB * B),",
      "    P a (snd b) = (Psnd P) a b := _.",
      "",
      "Definition run_if_valid {state arg aux : Type}",
      "                        (valid : state -> arg -> bool) f g (acc : state * aux) x :=",
      "  if valid (fst acc) x then (f (fst acc) x, g (snd acc) x) else acc.",
      "",
      "Lemma run_if_valid_rw :",
      "  forall {state arg aux : Type}",
      "         (valid : state -> arg -> bool)",
      "         f",
      "         g",
      "         l",
      "         (acc : state * aux)",
      "         initial_value",
      "         (initial_acc : aux)",
      "         (Invalid_is_noop :",
      "            forall state arg,",
      "              valid state arg = false ->",
      "              f state arg = state),",
      "    fold_left g (filter_args valid f initial_value l) initial_acc",
      "    = snd (fold_left (run_if_valid valid f g) l (initial_value, initial_acc)).",
      "intros state arg aux valid f g l.",
      "induction l; [ compute; auto | ].",
      "intros acc initial_value initial_acc Invalid_is_noop.",
      "case_eq (valid initial_value a).",
      "- intros Hvalid.",
      "  unfold filter_args; rewrite Hvalid; fold (filter_args valid).",
      "  rewrite fold_left_cons.",
      "  rewrite fold_left_cons.",
      "  unfold run_if_valid at 2.",
      "  unfold fst.",
      "  unfold snd at 2.",
      "  rewrite Hvalid.",
      "  apply IHl; assumption.",
      "- intros Hinvalid.",
      "  unfold filter_args; rewrite Hinvalid; fold (filter_args valid).",
      "  rewrite fold_left_cons.",
      "  rewrite Invalid_is_noop; try assumption.",
      "  unfold run_if_valid at 2.",
      "  unfold fst.",
      "  rewrite Hinvalid.",
      "  apply IHl; assumption.",
      "Qed.",
      ""
    ],
    "lemma_fold_invariant_aux-theorem-signature": [
      "Theorem fold_invariant_aux :",
      "  forall {state         : Type}                                (* The type of the contract storage, for us its 'storage_state' *)",
      "         {aux           : Type}                           (* The type of the auxiliaty cross-transaction data *)",
      "         (initial_value : state)                          (* Value of the storage before the first transaction *)",
      "         (initial_aux   : aux)                            (* Same as above for auxiliary data *)",
      "         {arg           : Type}                           (* Type of a transaction, for us its 'param' *)",
      "         (f             : state -> arg -> state)              (* The code of the contract's main function, 'main_option' *)",
      "         (g             : aux -> arg -> aux)                  (* Function describing what to do with aux data during a transaction *)",
      "         (l             : list arg)                       (* The list of blockchain transactions *)",
      "         (valid         : state -> arg -> bool)               (* The predicate saying when a transaction is valid or not *)",
      "         (filter_valid",
      "             := filter_args valid f initial_value)",
      "         (P             : state -> aux -> Prop)                  (* The over-all-transaction property we want to prove *)",
      "",
      "         (Invalid_is_noop :                               (* A proof that invalid transactions lead to no change of state *)",
      "           forall state arg,",
      "             valid state arg = false ->",
      "             f state arg = state)",
      "",
      "         (Hind : forall xarg xstate xaux,                      (* A proof that P is preserved over one call to the contract *)",
      "                   P xstate xaux ->",
      "                   (*In xarg l ->*)",
      "                   valid xstate xarg = true ->",
      "                   P (f xstate xarg) (g xaux xarg))",
      "",
      "         (H0 : P initial_value initial_aux),             (* A proof that P is true in the first place, at the start *)",
      "",
      "         P (fold_left f               l  initial_value)  (* The return type, aka the proof that P hold all the time *)",
      "           (fold_left g (filter_valid l) initial_aux)."
    ],
    "lemma_fold_invariant_aux-theorem-proof": [
      "intros.",
      "unfold filter_valid.",
      "rewrite run_if_valid_rw; try constructor; try assumption.",
      "rewrite Psnd_rw.",
      "set (PP := Psnd P).",
      "generalize dependent initial_value.",
      "generalize dependent initial_aux.",
      "induction l as [ | hd tl Hind' ]; [compute; auto | ].",
      "intros.",
      "repeat rewrite fold_left_cons.",
      "unfold run_if_valid at 2.",
      "unfold fst.",
      "case_eq (valid initial_value hd).",
      "- intros Hvalid.",
      "  unfold snd.",
      "  apply Hind'.",
      "  apply Hind; try constructor; try assumption; auto.",
      "- intros Hinvalid.",
      "  rewrite Invalid_is_noop; try assumption.",
      "  apply Hind'; assumption.",
      "Qed."
    ],
    "specification-imports": [
      "Require Import Notations.",
      "Require Import List.",
      "Import ListNotations.",
      "Require Import Nat.",
      ""
    ],
    "specification-utils-spec_bids_are_less_than_sold_for_amount": [
      "(* The object is sold for an amount greater than or equal to any (valid) bid seen so far. *)",
      "",
      "Definition main_get_storage (s : storage) (p : param) :=",
      "  snd (main (p, s)).",
      "",
      "Definition run_multiple_calls_ (s : storage) (l : list param) :=",
      "  fold_left main_get_storage l s.",
      "",
      "Definition run_multiple_calls (l : list param) :=",
      "  run_multiple_calls_ initial_storage l.",
      "",
      "Fixpoint contains_bid_ (has_bid : bool) (l : list param) (amount : nat) :=",
      "  match l with",
      "  | [] => False",
      "  | Bid a :: tl => if a =? amount then True else contains_bid_ true tl amount",
      "  | Claim :: tl => if has_bid then False else contains_bid_ has_bid tl amount",
      "  end.",
      "",
      "Definition contains_bid (l : list param) (amount : nat) :=",
      "   contains_bid_ false l amount.",
      ""
    ],
    "specification-spec_bids_are_less_than_sold_for_amount": [
      "(* If after some operations, the object is sold for an amount,",
      "   it will be sold for an amount >= any bid.",
      "",
      "   In other words, the object is never sold for less than",
      "   the amount of a (valid) bid. *)",
      "Definition spec_bids_are_less_than_sold_for_amount :=",
      "  forall (l : list param) (amount : nat),",
      "    forall (Hcontains : contains_bid l amount),",
      "      match run_multiple_calls l with",
      "      | Sold sold_for_amount => ",
      "          amount <= sold_for_amount",
      "      | _ => True",
      "      end.",
      ""
    ],
    "specification-utils-spec_max": [
      "(* The (current or final) price of the object is the max of all the (valid) bids seen so far *)",
      "",
      "Definition valid_op (s : storage) (p : param) :=",
      "  match (p, s) with",
      "  | (Bid newAmount, Available)                 => true",
      "  | (Bid newAmount, CurrentBid existingAmount) => existingAmount <? newAmount",
      "  | (Claim,         CurrentBid existingAmount) => true",
      "  | (_,             _storage)                  => false",
      "  end.",
      "Definition valid_ops := filter_args valid_op main_get_storage.",
      "Definition valid_ops' lop := valid_ops initial_storage lop.",
      "Fixpoint map_filter {A B} (f : A -> option B) l :=",
      "  match l with",
      "  | [] => []",
      "  | hd :: tl => match f hd with",
      "                | Some x => x :: map_filter f tl",
      "                | None => map_filter f tl",
      "                end",
      "  end.",
      "Definition get_bid (p : param) :=",
      "  match p with",
      "  | Bid n => Some n",
      "  | Claim => None",
      "  end.",
      "Definition get_bids (l : list param) := map_filter get_bid l.",
      "Definition aux_max := nat.",
      "Definition Pmax (s : storage) (a : aux_max) : Prop :=",
      "  (* Pmax: the storage is equal to the max of the bids seen so far *)",
      "  match s with",
      "  | Available => a = 0",
      "  | CurrentBid n => n = a",
      "  | Sold n => n = a",
      "  end.",
      ""
    ],
    "specification-spec_max": [
      "Definition spec_max :=",
      "  forall (l : list param),",
      "    Pmax (run_multiple_calls l) (list_max (get_bids (valid_ops' l))).",
      ""
    ],
    "proof_max-header": [
      "Require Import Notations.",
      "Require Import List.",
      "Import ListNotations.",
      "Require Import Nat.",
      "Require Import Coq.Arith.PeanoNat.",
      "Require Import Lia.",
      "",
      "Definition sold_for (s : storage) (l : list param) :=",
      "  match run_multiple_calls_ s l with",
      "  | Available    => 0",
      "  | CurrentBid n => n",
      "  | Sold       n => n",
      "  end.",
      "",
      "Theorem invalid_is_noop_on_main :",
      "  forall storage x,",
      "    valid_op storage x = false -> main_get_storage storage x = storage.",
      "intros s x Hinvalid.",
      "unfold main_get_storage.",
      "unfold main.",
      "case_eq x.",
      "- case_eq s.",
      "  + intros Hs n Hx.",
      "    rewrite Hs in Hinvalid.",
      "    rewrite Hx in Hinvalid.",
      "    unfold valid_op in Hinvalid.",
      "    inversion Hinvalid.",
      "  + intros n Hs n0 Hx.",
      "    rewrite Hs in Hinvalid.",
      "    rewrite Hx in Hinvalid.",
      "    unfold valid_op in Hinvalid.",
      "    case_eq (n <? n0).",
      "    * intros Hless.",
      "      rewrite Hless in Hinvalid.",
      "      inversion Hinvalid.",
      "    * intros Hmore.",
      "      unfold main_option.",
      "      rewrite Hmore.",
      "      reflexivity.",
      "  + intros n Hs n0 Hx.",
      "    reflexivity.",
      "- case_eq s.",
      "  + intros Hs Hx.",
      "    reflexivity.",
      "  + intros n Hs Hx.",
      "    rewrite Hs in Hinvalid.",
      "    rewrite Hx in Hinvalid.",
      "    unfold valid_op in Hinvalid.",
      "    inversion Hinvalid.",
      "  + intros n Hs Hx.",
      "    reflexivity.",
      "Qed.",
      "",
      "Theorem filter_valid_ops :",
      "  forall (l : list param) (s : storage),",
      "    run_multiple_calls_ s l =",
      "    run_multiple_calls_ s (valid_ops s l).",
      "",
      "intros l.",
      "induction l as [| hd tl IHl].",
      "- intro s.",
      "  auto.",
      "- intro s.",
      "  case_eq hd.",
      "  * intros n Hhd.",
      "    case_eq s.",
      "    + intro Hs.",
      "      unfold valid_ops.",
      "      fold valid_ops.",
      "      unfold valid_op.",
      "      simpl.",
      "      apply IHl.",
      "    + intro Hs.",
      "      case_eq (Hs <? n).",
      "      -- intros HH XX.",
      "         unfold valid_ops.",
      "         unfold filter_args; fold (filter_args valid_op).",
      "         unfold valid_op.",
      "         unfold main.",
      "         unfold main_option.",
      "         rewrite HH.",
      "         simpl snd.",
      "         unfold run_multiple_calls_.",
      "         unfold fold_left.",
      "         unfold main_get_storage.",
      "         unfold main.",
      "         unfold main_option.",
      "         rewrite HH.",
      "         simpl snd.",
      "         apply IHl.",
      "      -- intros HH XX.",
      "         unfold valid_ops.",
      "         unfold filter_args; fold (filter_args valid_op).",
      "         unfold main.",
      "         unfold main_option.",
      "         unfold valid_op.",
      "         rewrite HH.",
      "         simpl snd.",
      "         unfold run_multiple_calls_.",
      "         unfold fold_left.",
      "         unfold main_get_storage.",
      "         unfold main.",
      "         unfold main_option.",
      "         rewrite HH.",
      "         simpl snd.",
      "         apply IHl.",
      "    + intros n0 Hs.",
      "      unfold valid_ops.",
      "      fold valid_ops.",
      "      unfold valid_op.",
      "      simpl.",
      "      apply IHl.",
      "  * intros Hhd.",
      "    unfold valid_ops.",
      "    fold valid_ops.",
      "    unfold valid_op.",
      "    case_eq s.",
      "    + intros Hs.",
      "      apply IHl.",
      "    + intros n Hs.",
      "      apply IHl.",
      "    + intros n Hs.",
      "      apply IHl.",
      "Qed.",
      "",
      "Lemma filter_valid_ops_short_proof :",
      "  forall (l : list param) (s : storage),",
      "    run_multiple_calls_ s l =",
      "    run_multiple_calls_ s (valid_ops s l).",
      "",
      "intros l.",
      "induction l as [| hd tl IHl].",
      "- auto.",
      "- intro s.",
      "  case_eq hd.",
      "  * intros n Hhd.",
      "    case_eq s;",
      "      intros n0;",
      "      intros;",
      "      try apply IHl.",
      "      case_eq (n0 <? n);",
      "         intros HH;",
      "         unfold valid_ops;",
      "         unfold filter_args;",
      "         unfold valid_op;",
      "         unfold run_multiple_calls_;",
      "         unfold fold_left;",
      "         unfold main_get_storage;",
      "         unfold main;",
      "         unfold main_option;",
      "         rewrite HH;",
      "         try rewrite HH;",
      "         apply IHl.",
      "  * intros.",
      "    case_eq s;",
      "      intros;",
      "      apply IHl.",
      "Qed.",
      "",
      "Theorem filter_valid_ops' :",
      "  forall (l : list param),",
      "    run_multiple_calls l =",
      "    run_multiple_calls (valid_ops' l).",
      "intros.",
      "unfold run_multiple_calls.",
      "unfold valid_ops.",
      "apply filter_valid_ops.",
      "Qed.",
      "",
      "Lemma first_op_is_bid'' :",
      "  forall (l : list param),",
      "    match (valid_ops initial_storage l) with",
      "    | Bid n :: _ => True",
      "    | [] => True",
      "    | _ => False",
      "    end.",
      "intros l.",
      "induction l as [| p l IHl].",
      "- now compute.",
      "- case_eq p.",
      "  * intros n Hp.",
      "    unfold initial_storage.",
      "    unfold valid_ops.",
      "    unfold filter_args; fold (filter_args valid_op).",
      "    unfold valid_op.",
      "    fold valid_op.",
      "    auto.",
      "  * compute.",
      "    auto.",
      "Qed.",
      "",
      "Lemma first_op_is_bid_eqv :",
      "  forall (l : list param),",
      "    (valid_ops initial_storage l) <> [] ->",
      "    (match (valid_ops initial_storage l) with",
      "     | Bid n :: _ => True",
      "     | _ => False",
      "     end)",
      "    = (match (valid_ops initial_storage l) with",
      "       | Bid n :: _ => True",
      "       | [] => True",
      "       | _ => False",
      "       end).",
      "intros l nonempty.",
      "set (filtered := valid_ops initial_storage l) in *.",
      "case_eq filtered.",
      "- contradiction.",
      "- auto.",
      "Qed.",
      "",
      "Theorem first_op_is_bid :",
      "  forall (l : list param),",
      "    (valid_ops initial_storage l) <> [] ->",
      "    match (valid_ops initial_storage l) with",
      "     | Bid n :: _ => True",
      "     | _ => False",
      "     end.",
      "intros l nonempty.",
      "set (H := first_op_is_bid_eqv l nonempty).",
      "rewrite H.",
      "apply first_op_is_bid''.",
      "Qed.",
      "",
      "Fixpoint max_bid (s : storage) (l : list param) :=",
      "  match l with",
      "  | [] => s",
      "  | Bid n :: tl =>",
      "    match s with",
      "    | Available => max_bid (CurrentBid n) tl",
      "    | CurrentBid max =>",
      "      if n <? max",
      "      then max_bid (CurrentBid max) tl",
      "      else max_bid (CurrentBid n) tl",
      "    | Sold n => Sold n (* TODO: impossible with assumption valid_ops *)",
      "    end",
      "  | hd :: tl => max_bid s tl",
      "  end.",
      "",
      "Definition u_max (a : nat) (p : param) :=",
      "  match p with",
      "  | Bid n => max n a",
      "  | Claim => a",
      "  end.",
      "",
      "(*",
      "Compute fold_left u_max                      [ Bid 1; Bid 2; Bid 3; Claim ] 0.",
      "Compute fold_left u_max                      [ Bid 1; Bid 2; Bid 3; Claim; Bid 4 ] 0.",
      "Compute fold_left u_max (valid_ops Available [ Bid 1; Bid 2; Bid 3; Claim; Bid 4 ]) 0.",
      "*)",
      "",
      "Lemma fold_get_bids :",
      "  forall l z,",
      "    (fold_left max (get_bids (valid_ops' l)) z)",
      "  = (fold_left u_max (valid_ops' l) z).",
      "intros l.",
      "induction (valid_ops' l) as [| a ll IHll]; [ compute; auto | ].",
      "intros z0.",
      "unfold get_bids.",
      "unfold map_filter; fold (map_filter get_bid).",
      "case_eq a.",
      "- intros n Ha.",
      "  unfold get_bid at 1.",
      "  fold ([n] ++ (map_filter get_bid ll)).",
      "  rewrite fold_left_app.",
      "  fold (get_bids ll).",
      "  fold ([Bid n] ++ ll).",
      "  rewrite fold_left_app.",
      "  replace (fold_left u_max [Bid n] z0) with (fold_left max [n] z0).",
      "  + apply IHll.",
      "  + apply Nat.max_comm.",
      "- intros Ha.",
      "  unfold get_bid at 1.",
      "  fold ([Claim] ++ ll).",
      "  rewrite fold_left_app.",
      "  fold (get_bids ll).",
      "  replace (fold_left u_max [Claim] z0) with z0.",
      "  + apply IHll.",
      "  + reflexivity.",
      "Qed.",
      "",
      "Lemma main_preserves_invariant_max :",
      "  forall (xarg : param)",
      "         (xstate : storage)",
      "         (xaux : nat)",
      "         (Pprev : Pmax xstate xaux)",
      "         (Hvalid : valid_op xstate xarg = true),",
      "    Pmax (main_get_storage xstate xarg) (u_max xaux xarg).",
      "intros xarg xstate xaux Pprev Hvalid.",
      "case_eq xarg.",
      "- case_eq xstate.",
      "  * intros Hstate n Harg.",
      "    cut (xaux = 0).",
      "    + intros Haux.",
      "      unfold u_max.",
      "      rewrite Haux.",
      "      rewrite Nat.max_0_r.",
      "      compute.",
      "      auto.",
      "    + unfold Pmax in Pprev.",
      "      rewrite Hstate in Pprev.",
      "      assumption.",
      "  * intros n Hstate n0 Harg.",
      "    rewrite Hstate in Hvalid.",
      "    rewrite Harg in Hvalid.",
      "    unfold valid_op in Hvalid.",
      "    unfold Pmax in Pprev.",
      "    rewrite Hstate in Pprev.",
      "    unfold main_get_storage.",
      "    unfold u_max.",
      "    unfold main.",
      "    unfold main_option.",
      "    rewrite Hvalid.",
      "    rewrite <- Pprev.",
      "    unfold snd.",
      "    unfold Pmax.",
      "    rewrite Nat.max_comm.",
      "    rewrite Nat.max_r.",
      "    + reflexivity.",
      "    + apply Nat.leb_le in Hvalid.",
      "      lia.",
      "  * intros n Hstate n0 Harg.",
      "    rewrite Hstate in Hvalid.",
      "    rewrite Harg in Hvalid.",
      "    unfold valid_op in Hvalid.",
      "    inversion Hvalid.",
      "- case_eq xstate.",
      "  * intros Hstate Harg.",
      "    rewrite Hstate, Harg in Hvalid.",
      "    unfold valid_op in Hvalid.",
      "    inversion Hvalid.",
      "  * intros n Hstate Harg.",
      "    unfold main_get_storage.",
      "    unfold u_max.",
      "    unfold main.",
      "    unfold main_option.",
      "    unfold snd.",
      "    unfold Pmax.",
      "    rewrite Hstate in Pprev.",
      "    unfold Pmax in Pprev.",
      "    rewrite Pprev in *.",
      "    reflexivity.",
      "  * intros n Hstate Harg.",
      "    unfold main_get_storage.",
      "    unfold u_max.",
      "    unfold main.",
      "    unfold main_option.",
      "    unfold fail_in_main.",
      "    unfold snd.",
      "    unfold Pmax.",
      "    rewrite Hstate in Pprev.",
      "    unfold Pmax in Pprev.",
      "    rewrite Pprev in *.",
      "    reflexivity.",
      "Qed.",
      ""
    ],
    "proof_max-reminder": [
      "Print spec_max.",
      "(* spec_max =",
      "    forall l : list param,",
      "      Pmax (run_multiple_calls l) (list_max (get_bids (valid_ops' l)))",
      "    : Prop *)",
      ""
    ],
    "proof_max-proof": [
      "Theorem unit_test_max : spec_max.",
      "intros l.",
      "",
      "unfold list_max.",
      "rewrite <- fold_symmetric; cycle 1. ",
      "- intros x y z.",
      "  rewrite Nat.max_assoc.",
      "  reflexivity.",
      "- intros y.",
      "  rewrite Nat.max_0_l.",
      "  rewrite Nat.max_0_r.",
      "  reflexivity.",
      "- rewrite fold_get_bids.",
      "  unfold valid_ops'.",
      "  unfold valid_ops.",
      "  unfold run_multiple_calls.",
      "  unfold run_multiple_calls_.",
      "  apply fold_invariant_aux.",
      "  + intros state arg Hinvalid.",
      "    rewrite invalid_is_noop_on_main; auto.",
      "  + apply main_preserves_invariant_max.",
      "  + compute; auto.",
      "Qed.",
      ""
    ],
    "extract-definitions": [
      "Require Import List.",
      "Import ListNotations.",
      "Require Import Nat.",
      "",
      "(* Extract to OCaml language *)",
      "Require Extraction.",
      "Extraction Language OCaml.",
      "",
      "(* LIGO built-ins *)",
      "Extract Inlined Constant tez => \"tez\".",
      "Extract Inlined Constant operation => \"operation\".",
      "Extract Constant contract \"'t\" => \"'t contract\".",
      "Extract Inlined Constant destination_account => \"(Tezos.get_contract_with_error (Tezos.get_sender ()) \"\"oops\"\" : unit contract)\".",
      "Extract Inlined Constant transaction => \"Tezos.transaction\".",
      "Extract Inlined Constant mutez => \"(fun n -> mutez_of_nat (abs n))\".",
      "",
      "(* OCaml built-ins *)",
      "Extract Inductive unit => unit [\"()\"].",
      "(* Implement external LIGO function \"fail\" *)",
      "(*Extraction Implicit fail [A a].*)",
      "(* It is okay for some proofs to implement our identity function named \"fail\" with",
      "   \"failwith\", even in the case where the code isn't",
      "   \"let main = function \u2026 | \u2026 -> fail | \u2026\" but e.g. is",
      "   \"let main = function \u2026 | \u2026 -> f (fail) | \u2026\".",
      "",
      "   In the coq world, the extra f(identity(some_value)) in the chain of calls",
      "   still needs to satisfy the proofs. This is okay for some proofs, but not e.g.",
      "   for proofs saying that a user is always able to claim an auction after some",
      "   time (the action of claiming an auction could go through a \"fail\" path, which",
      "   would make it seem possible in Coq but wouldn't actually be possible on-chain).",
      "",
      "   We therefore use fail_in_main only once, at the top-level, where it is obvious",
      "   that its return value is never used by the rest of the contract.",
      "",
      "   If the following line is removed, the resulting contract will behave exactly",
      "   the same way, but will consume gas and perform a no-op instead of warning the",
      "   user before performing invalid operations.",
      " *)",
      "Definition ok_main (ps : param * storage) : (list operation * storage) :=",
      "  match ps with",
      "  (* Start a bid *)",
      "  | (Bid newAmount, Available) => ([], CurrentBid newAmount)",
      "  (* e.g. rest is not implemented yet *)",
      "  | (_p,s)                     => fail_in_main ([], s)",
      "  end.",
      "Definition bad_f (x : list operation * storage) := (fst x, CurrentBid 42).",
      "Definition bad_main (ps : param * storage) : (list operation * storage) :=",
      "  match ps with",
      "  (* Start a bid *)",
      "  | (Bid newAmount, Available) => ([], CurrentBid newAmount)",
      "  | (_p,s)                     => bad_f (fail_in_main ([], s))",
      "  end.",
      "Extract Inlined Constant fail_in_main => \"(fun (_ : (operation list * storage)) : (operation list * storage) -> failwith \"\"Err\"\")\".",
      "(*Unset Extraction SafeImplicits.*)",
      "Extract Inductive list => \"list\" [ \"[]\" \"(::)\" ].",
      "Extract Inductive prod => \"(*)\"  [ \"(,)\" ].",
      "Extract Inductive option => \"option\"  [ \"Some\" \"None\" ].",
      "Extract Inductive nat => nat [ \"0\" \"succ\" ] \"(fun fO fS n -> if n=0 then fO () else fS (n-1))\".",
      "Extract Inductive bool => \"bool\" [ \"true\" \"false\" ].",
      "Extract Inlined Constant ltb => \"(fun (a : nat) (b : nat) : bool -> a < b)\".",
      "",
      "(* Prevent access to opaque definitions. *)",
      "Unset Extraction AccessOpaque.",
      ""
    ],
    "extract-print-assumptions": [
      "Definition checkAssumptions := (main, unit_test_max).",
      "Print Assumptions checkAssumptions.",
      "(*",
      "Axioms:",
      "transaction : \u2200 param : Type, param \u2192 tez \u2192 contract param \u2192 operation",
      "operation  : Type",
      "mutez  : nat \u2192 tez",
      "destination_account  : contract unit",
      "*)",
      ""
    ],
    "extract-extraction": [
      "(* Compile Coq code to OCaml *)",
      "Extraction \"contract.1.ocaml.ml\" main.",
      ""
    ]
  },
  "order": [
    "contract-boilerplate-header",
    "contract-type-storage",
    "contract-type-metadata",
    "contract-type-param",
    "contract-main-option",
    "contract-main-err",
    "contract-initial-storage",
    "contract-tactics-utils",
    "filter_args",
    "lemma_fold_invariant_aux-header",
    "lemma_fold_invariant_aux-theorem-signature",
    "lemma_fold_invariant_aux-theorem-proof",
    "specification-imports",
    "specification-utils-spec_bids_are_less_than_sold_for_amount",
    "specification-spec_bids_are_less_than_sold_for_amount",
    "specification-utils-spec_max",
    "specification-spec_max",
    "proof_max-header",
    "proof_max-reminder",
    "proof_max-proof",
    "extract-definitions",
    "extract-print-assumptions",
    "extract-extraction"
  ]
}