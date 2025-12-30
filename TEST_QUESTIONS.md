# Test Questions - RAG System

List of questions to test the system functionality with content about Lev-Boots Technology.

## General Technology Questions

1. **What are Lev-Boots?**
   - Expected: Explanation of boots technology with gravity reversal

2. **How do Lev-Boots work?**
   - Expected: Explanation of localized gravity reversal physics

3. **What is gravitational reversal technology?**
   - Expected: Explanation of Gravitational Reversal Technology

4. **What are the applications of Lev-Boots?**
   - Expected: Military, urban transportation, warehousing, and more

## Specific Questions from PDFs

5. **What is written in the research paper on gravitational reversal physics?**
   - Expected source: Research Paper - Gravitational Reversal Physics.pdf

6. **What is the white paper on developing gravitational reversal technology?**
   - Expected source: White Paper - The Development of Localized Gravity Reversal Technology.pdf

7. **What is the opinion article about the revolution at our feet?**
   - Expected source: OpEd - A Revolution at Our Feet.pdf

## Questions about Specific Applications

8. **How are Lev-Boots used in military deployment?**
   - Expected source: military-deployment-report article

9. **What is the use of Lev-Boots in urban transportation?**
   - Expected source: urban-commuting article

10. **How are Lev-Boots used in warehouses?**
    - Expected source: warehousing article

11. **What is the consumer safety topic of Lev-Boots?**
    - Expected source: consumer-safety article

12. **What is Hover Polo and how is it related to Lev-Boots?**
    - Expected source: hover-polo article

## Technical Questions

13. **What are the dimensions of the embeddings?**
    - Note: This shouldn't be in the knowledge base, it's a question about the system

14. **How is text split into chunks?**
    - Note: This shouldn't be in the knowledge base, it's a question about the system

## Questions That Should Not Work

15. **What's the weather today?**
    - Expected: "I couldn't find any relevant information" - This is fine, it's not related to Lev-Boots

16. **How do you make pasta?**
    - Expected: "I couldn't find any relevant information" - This is fine, it's not related to Lev-Boots

## Complex Questions

17. **What's the difference between military and civilian use of Lev-Boots?**
    - Expected: Answer that combines information from multiple sources

18. **What are the challenges in developing Lev-Boots?**
    - Expected: Answer that combines information from articles and research

19. **What are the advantages of Lev-Boots compared to traditional transportation methods?**
    - Expected: Answer that combines information from multiple sources

## Testing Instructions

1. **Before testing:**
   - Make sure data is loaded: `/api/load_data`
   - Check how many records exist: `npm run test:db` (if you created the script)

2. **During testing:**
   - Try each question separately
   - Check if the answer is relevant
   - Check if the answer cites sources

3. **After testing:**
   - Note which questions worked
   - Note which questions didn't work
   - Check if there are errors in the console
