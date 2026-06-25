# Gym Assistant Tests

Future tests should cover:

- Blank date cells inherit the previous date.
- Exercise matching trims extra spaces and ignores case.
- Vietnamese decimal weights like `12,5` parse as `12.5`.
- Appending the first exercise of a new day writes the date cell.
- Appending another exercise on the same day leaves the date cell blank.
- Updating a set changes only that set's rep and weight cells.

