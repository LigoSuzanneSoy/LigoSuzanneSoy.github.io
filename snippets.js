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
      "(* ********************************************* *)"
    ]
  },
  "order": [
    "contract-boilerplate-header",
    "contract-type-storage",
    "contract-type-metadata",
    "contract-type-param",
    "contract-main-option",
    "contract-main-err",
    "contract-initial-storage"
  ]
}