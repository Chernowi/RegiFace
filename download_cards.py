import os
import requests
import zipfile
import io
import re # For more flexible parsing

# --- Configuration ---
NEW_ZIP_URL = "https://opengameart.org/sites/default/files/Playing%20Cards.zip"
IMAGE_DIR = "img/cards" # Directory to save card images

# Mapping for ranks: Filename part -> API Rank
# (We need to discover these from the filenames in the new zip)
# Example: "ace" -> "A", "king" -> "K", "2" -> "2"
FILENAME_RANK_MAP = {
    "ace": "A", "king": "K", "queen": "Q", "jack": "J",
    "10": "10", "9": "9", "8": "8", "7": "7", "6": "6",
    "5": "5", "4": "4", "3": "3", "2": "2",
    # Some packs might use 'one' for Ace, etc. Add as needed.
}

# Mapping for suits: Filename part -> API Suit
# Example: "spades" -> "S", "hearts" -> "H"
FILENAME_SUIT_MAP = {
    "spades": "S", "hearts": "H", "diamonds": "D", "clubs": "C"
}

# Our desired output format: RankSuit.png (e.g., AS.png, KH.png, 10D.png, JOKER.png)
# API sends: "AS", "2H", "10D", "JC", "X" (for Joker)

def download_and_extract_oga_cards():
    if not os.path.exists(IMAGE_DIR):
        os.makedirs(IMAGE_DIR)
        print(f"Created directory: {IMAGE_DIR}")

    print(f"Downloading card pack from {NEW_ZIP_URL}...")
    try:
        headers = { # Some sites require a User-Agent
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
        }
        response = requests.get(NEW_ZIP_URL, headers=headers, stream=True)
        response.raise_for_status() # Check for download errors
        
        with zipfile.ZipFile(io.BytesIO(response.content)) as z:
            print("Extracting and renaming card images...")
            
            extracted_files_count = 0
            for member_path in z.namelist():
                # We are looking for PNG files, often in a subdirectory.
                # Common patterns: "PNG/king_of_spades.png", "cards/2_of_hearts.png", or just "ace_of_clubs.png"
                if member_path.lower().endswith(".png"):
                    original_filename = os.path.basename(member_path).lower() # e.g., king_of_spades.png
                    
                    api_rank_char = None
                    api_suit_char = None
                    is_joker = False

                    # Attempt to parse rank and suit from filename
                    # Example: "king_of_spades.png"
                    # Example: "2_of_hearts.png"
                    # Example: "joker_black.png" or "red_joker.png"

                    if "joker" in original_filename:
                        is_joker = True
                    else:
                        parts = original_filename.replace(".png", "").split("_of_")
                        if len(parts) == 2: # e.g., ["king", "spades"] or ["2", "hearts"]
                            rank_part_from_file = parts[0].lower()
                            suit_part_from_file = parts[1].lower()

                            api_rank_char = FILENAME_RANK_MAP.get(rank_part_from_file)
                            api_suit_char = FILENAME_SUIT_MAP.get(suit_part_from_file)
                        else:
                            # Try another pattern if "_of_" isn't used, e.g. "Spades K.png" (less common)
                            # This part would need more specific regex if the pattern is very different
                            # For now, we rely on the "_of_" convention or simple joker names.
                            # print(f"Skipping due to unrecognized filename pattern: {original_filename}")
                            pass


                    # --- Construct new filename based on API expectations ---
                    new_filename_target = None
                    if is_joker:
                        # Prioritize one joker image if multiple exist (e.g., red/black)
                        if not os.path.exists(os.path.join(IMAGE_DIR, "JOKER.png")):
                            new_filename_target = "JOKER.png"
                        # else:
                            # print(f"Skipping additional joker variant: {original_filename}")
                    elif api_rank_char and api_suit_char:
                        # API uses Rank then Suit for card strings: "AS", "2H", "10D", "JC"
                        # Image filename should match this: "AS.png", "2H.png", "10D.png", "JC.png"
                        new_filename_target = f"{api_rank_char.upper()}{api_suit_char.upper()}.png"
                    

                    if new_filename_target:
                        target_path = os.path.join(IMAGE_DIR, new_filename_target)
                        
                        # Avoid overwriting if we already processed a suitable file (e.g. for Joker)
                        if os.path.exists(target_path) and new_filename_target == "JOKER.png":
                            continue
                        if os.path.exists(target_path) and new_filename_target != "JOKER.png":
                            print(f"Warning: Overwriting {new_filename_target} with image from {original_filename}. This might happen if multiple images map to the same card.")

                        try:
                            with z.open(member_path) as source_f:
                                with open(target_path, "wb") as target_f:
                                    target_f.write(source_f.read())
                            # print(f"Saved: {original_filename} (from {member_path}) as {new_filename_target}")
                            extracted_files_count +=1
                        except Exception as e_extract:
                            print(f"Error extracting/saving {member_path}: {e_extract}")
            
            if extracted_files_count > 0:
                print(f"Successfully processed and saved {extracted_files_count} card images.")
            else:
                print("No card images were extracted. Please check the ZIP file structure and script parsing logic.")
                print("You might need to open 'Playing Cards.zip' manually, inspect filenames, and adjust FILENAME_RANK_MAP, FILENAME_SUIT_MAP, or the filename parsing logic in this script.")

            print(f"Please check the '{IMAGE_DIR}' directory.")

    except requests.exceptions.RequestException as e:
        print(f"Error downloading card pack: {e}")
    except zipfile.BadZipFile:
        print("Error: Downloaded file is not a valid zip archive. It might be an HTML error page.")
        print("Try opening the URL in your browser to confirm the file downloads correctly.")
    except Exception as e:
        print(f"An unexpected error occurred: {e}")

if __name__ == "__main__":
    download_and_extract_oga_cards()
    # After running, you should have an `img/cards` directory with files like:
    # AS.png, KH.png, QD.png, JC.png, 10D.png, 2H.png, ..., JOKER.png