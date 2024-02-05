(* SNIPPET = contract-boilerplate-header *)
(* Simple auction contract *)

(* Require Coq built-ins, declare LIGO built-ins and shorthands *)
Require Import Notations.
Require Import List.
Require Import Nat.
Import ListNotations.
Notation "()" := tt.                (* tt means "null" or "Unit" in Coq *)
Parameter tez : Type.
Parameter operation : Type.             (* declare external LIGO type "operation" *)
(*
Definition operation : Type.        (* type operation = … *)
(* could substitute with an actual implementation of operation as e.g. a string of bytes. *)
exact (list nat).
Qed. (* make it opaque. *)
*)
Parameter contract : Type -> Type.
Parameter destination_account : contract unit.
Parameter transaction : forall {param : Type} (action : param) (amount : tez), contract param -> operation.
Parameter mutez : nat -> tez.

(* Declare external LIGO function "fail_in_main". Note that it should only be
   used once at the top-level of the "main" wrapper function. This is due to the
   fact that Coq does not support exceptions or partial functions, so it must be
   absolutely clear that the behaviour of failure is identical to a no-op contract.
   See the explanation below in the section about extraction. *)
Definition fail_in_main {A} (a : A) := a.

(* ********************************************* *)
(*                    Contract                   *)
(* ********************************************* *)

(* SNIPPET = contract-type-storage *)
(* Declare enum for the storage (three states) *)
Inductive storage :=
| Available  : storage
| CurrentBid : nat -> storage
| Sold       : nat -> storage.

(* SNIPPET = contract-type-metadata *)
(* SNIPPET = contract-type-param *)
(* Declare enum for the parameter (two possible actions) *)
Inductive param :=
| Bid   : nat -> param
| Claim : param.

(* SNIPPET = contract-main-option *)
(* Behaviour of the contract. *)
Definition main_option (ps : param * storage) : option ((list operation) * storage) :=
  match ps with
  (* Start a bid *)
  | (Bid newAmount, Available)                 => Some ([], CurrentBid newAmount)
  (* New bid (must be higher than the existing *)
  | (Bid newAmount, CurrentBid existingAmount) =>
    if existingAmount <? newAmount then
      Some ([], CurrentBid newAmount)
    else
      None
  (* Finish the auction *)
  | (Claim,         CurrentBid existingAmount) => Some ([transaction tt (mutez 0) destination_account], Sold existingAmount)
  (* All other cases are errors. *)
  | (_,             _storage)                  => None
  end.

(* SNIPPET = contract-main-err *)
Definition main (ps : param * storage) : (list operation * storage) :=
  match main_option ps with
  (* On success, return the result *)
  | Some result => result
  (* On failure, return an empty list of operations and the unmodified storage *)
  | None => fail_in_main ([], let (p,s) := ps in s)
  end.

(* SNIPPET = contract-initial-storage *)
Definition initial_storage := Available.

(* SNIPPET = tactics-utils *)
Ltac subproof name :=
  refine ?[name]; shelve.

Ltac check_is_ctor ctor c :=
match c with
| ctor => idtac
| ?f _ => check_is_ctor ctor f
end.

Tactic Notation "when" constr(ctor) ident_list(pat) "as" ident(H) :=
intros pat;
match goal with
| |- _ = ?c -> _ => check_is_ctor ctor c
| _ => fail "wrong constructor, expected" ctor
end;
intro H.

(* SNIPPET = tactics-test-demo *)
Definition identity {A : Type} (x : A) := x.
Inductive bar := A | B : nat -> nat -> bar | C.

Goal forall y : bar, y = y.
(* Run until here, with the GUI try to reproduce the proof below. *)
idtac.
intros y.
case_eq y.(**)
- when A as Hy.(**)
  reflexivity.(**)
- when B n n0 as Hy.(**)
  case_eq n.
  + when 0 as Hn.(**)
    reflexivity.(**)
  + when S n1 as Hn.(**)
    reflexivity.(**)
- when C as Hy.(**)
  reflexivity.
Qed.

Goal forall x : bar, x = x.
intros x.
case_eq x.
- subproof a.
- subproof b.
- subproof c.
[a]:{
  intros.
  reflexivity.
}
[b]:{
  intros.
  reflexivity.
}
[c]:{
  intros.
  reflexivity.
}
Qed.

Goal identity initial_storage = identity Available.
Proof.

(* ********************************************* *)
(*                End of Contract                *)
(* ********************************************* *)