#!/usr/bin/env bash

set -euET -o pipefail

ipfs cid base32 $(ipfs add --ignore-rules-path .ipfsignore --progress=true --pin=false --hidden -Qr .)
